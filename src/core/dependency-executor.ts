// 异步合同依赖执行器：拓扑依赖 + 当前节点重解析 + 原轮取消；不创建另一套 DOM 写入驱动。
import type { AdapterFieldContract, SchoolAdapterPackage } from './adapters';
import { resolveAdapterPage } from './adapter-packages';
import { buildDepOrder } from './dependency';
import { fillAdapterContract, resolveContractControl } from './control-drivers';
import type { ContractFillItem } from './control-drivers';
import { beginWriteScope, endWriteScope, readNativeControlValue } from './filler';
import type { RunSnapshot } from './fill-session';
import { getByPath, getProfileCode } from './profile';
import type { Profile } from './profile';
import { findNewAttributableError } from './task-executor';

const POLL_MS = 25;
const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_SETTLE_MS = 100;

export interface DependencyExecutionOptions {
  run?: RunSnapshot;
  validationBaseline?: string[];
  /** 调用方必须捕获原轮；本执行器在每次等待后和写入前检查。 */
  stillActive: () => boolean;
}

interface VerifiedTarget {
  el: Element;
  value: string;
  contract: AdapterFieldContract;
}

/** 功能：短间隔异步等待；取消的最长检查间隔为 POLL_MS，不产生任何 DOM 副作用。 */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

/** 功能：判定原生控件是否可用；只读/禁用/忙碌时不使用解锁机制提前写依赖控件。 */
function isReady(doc: Document, el: Element, field: AdapterFieldContract, profile: Profile, adapter: SchoolAdapterPackage): boolean {
  if (!el.isConnected || el.ownerDocument !== doc || el.matches(':disabled,[readonly],[aria-busy="true"]')) return false;
  if (field.dependencyWait?.readySelector && !doc.querySelector(field.dependencyWait.readySelector)) return false;
  if (el.tagName === 'SELECT') {
    const target = String(getByPath(profile, field.profilePath || '') || '').trim();
    const code = getProfileCode(profile, field.profilePath || '', [field.codeNamespace, ...(adapter.codeNamespaces || [])].filter((s): s is string => !!s));
    // 已有选项也允许进入驱动的冲突判定；空控件则须等到目标选项真正出现。
    const select = el as HTMLSelectElement;
    const selected = select.selectedOptions[0];
    if (selected?.value && !/请选择|选择|----/.test(selected.text)) return true;
    return Array.from(select.options).some((o) => (code && o.value === code) || o.text.trim() === target || o.value === target);
  }
  return true;
}

/**
 * 功能：异步执行含 dependsOn 的合同，独立根任务并行推进，子任务只在父项稳定确认后启动。
 * 原理：每个字段一个 Promise；await 所有父 Promise 等价于有向无环图的就绪队列。
 * 时间预算同时覆盖就绪和稳定期；父节点被替换/改值立即失效，子节点在执行前重新解析。
 */
export async function fillAdapterContractAsync(
  profile: Profile, doc: Document, url: string, adapter: SchoolAdapterPackage,
  options: DependencyExecutionOptions,
): Promise<ContractFillItem[]> {
  const pageRes = resolveAdapterPage(adapter, doc, url);
  const page = pageRes.winner?.page;
  if (pageRes.ambiguous || !page?.fields?.length) return [];
  const fields = page.fields.filter((f) => f.profilePath && !f.readonly && f.driver !== 'table');
  const nodes = fields.map((f) => ({ id: f.profilePath!, dependsOn: f.dependsOn || [] }));
  const graph = buildDepOrder(nodes);
  const byId = new Map(fields.map((f) => [f.profilePath!, f]));
  const verified = new Map<string, VerifiedTarget>();
  const tasks = new Map<string, Promise<ContractFillItem>>();
  const errorSelectors = page.validationErrorSelectors || [];
  const errorBaseline = options.validationBaseline || errorSelectors.flatMap((selector) => {
    try { return Array.from(doc.querySelectorAll(selector), (el) => (el.textContent || '').trim()); }
    catch { return []; }
  });

  /** 功能：构造不可写结果并认领当前候选，防止通用链绕过依赖阻塞。 */
  function stopped(field: AdapterFieldContract, state: 'blocked' | 'cancelled' | 'failed', reason: string): ContractFillItem {
    const resolved = resolveContractControl(doc, field);
    return { profilePath: field.profilePath!, status: 'failed', dependencyState: state, reason,
      el: resolved.el, ambiguousNodes: resolved.candidates };
  }

  /** 功能：复验所有祖先仍连接且保持已确认语义，防止同 ID 新节点继承旧节点授权。 */
  function parentsValid(id: string): boolean {
    return (byId.get(id)?.dependsOn || []).every((parentId) => {
      const parent = verified.get(parentId);
      if (!parent || !parent.el.isConnected || parent.el.ownerDocument !== doc) return false;
      const current = resolveContractControl(doc, parent.contract);
      return current.ok && current.el === parent.el && readNativeControlValue(parent.el) === parent.value && parentsValid(parentId);
    });
  }

  if (graph.cycle || graph.missing.length || byId.size !== fields.length) {
    return fields.map((field) => stopped(field, 'blocked', '依赖图存在环、缺引用或重复字段，未执行写入'));
  }

  /** 功能：等待一个字段的所有父项并执行一次驱动；每次异步恢复都校验原轮和祖先。 */
  async function execute(field: AdapterFieldContract): Promise<ContractFillItem> {
    const id = field.profilePath!;
    const parents = await Promise.all((field.dependsOn || []).map((parentId) => tasks.get(parentId)!));
    if (!options.stillActive()) return stopped(field, 'cancelled', '原轮已取消或页面已变化，未继续依赖填写');
    if (parents.some((p) => p.dependencyState !== 'verified')) return stopped(field, 'blocked', '依赖字段尚未验证成功，未填写子字段');
    const timeout = field.dependencyWait?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const settle = field.dependencyWait?.settleMs ?? DEFAULT_SETTLE_MS;
    const deadline = Date.now() + timeout;
    let readyEl: Element | undefined;
    let readySince = 0;
    try {
      while (Date.now() < deadline) {
        if (!options.stillActive()) return stopped(field, 'cancelled', '原轮已取消，未继续依赖填写');
        if (!parentsValid(id)) return stopped(field, 'blocked', '父控件被替换或改值，依赖授权已失效');
        const current = resolveContractControl(doc, field);
        if (current.candidates?.length) return stopped(field, 'blocked', current.reason);
        if (current.ok && current.el && isReady(doc, current.el, field, profile, adapter)) {
          if (readyEl !== current.el) { readyEl = current.el; readySince = Date.now(); }
          if (Date.now() - readySince >= settle) break;
        } else { readyEl = undefined; readySince = 0; }
        await pause();
      }
      if (!readyEl || Date.now() >= deadline) return stopped(field, 'failed', '等待依赖控件就绪超时，未写入旧控件');
      if (!options.stillActive() || !parentsValid(id)) return stopped(field, 'cancelled', '写入前原轮或父目标已失效');
      // 每次只委托一个已就绪字段给既有驱动，依赖由本执行器负责，不复制写入算法。
      const singleAdapter: SchoolAdapterPackage = { ...adapter, pages: [{ ...page!, fields: [{ ...field, dependsOn: [] }] }] };
      let item: ContractFillItem | undefined;
      beginWriteScope(doc, options.run);
      try { item = fillAdapterContract(profile, doc, url, singleAdapter)[0]; }
      finally { endWriteScope(); }
      if (!item) return stopped(field, 'failed', '字段驱动未返回结果');
      if (item.status !== 'filled' && !item.alreadyCorrect) {
        return { ...item, dependencyState: item.pickerContext ? 'waiting' : 'blocked' };
      }
      const el = item.el;
      if (!el) return stopped(field, 'failed', '字段没有可验证的目标');
      const value = readNativeControlValue(el);
      const stableUntil = Date.now() + settle;
      while (Date.now() < stableUntil) {
        await pause();
        if (!options.stillActive()) return stopped(field, 'cancelled', '写后原轮已失效，未放行子字段');
        if (!parentsValid(id) || !el.isConnected || resolveContractControl(doc, field).el !== el || readNativeControlValue(el) !== value) {
          return stopped(field, 'failed', '写后控件被替换或改值，未放行子字段');
        }
        if (Date.now() >= deadline) return stopped(field, 'failed', '依赖稳定验证超时');
      }
      // 控件可在 change 中声明忙碌，等待异步完成后再释放子项。
      while (!isReady(doc, el, field, profile, adapter)) {
        if (!options.stillActive()) return stopped(field, 'cancelled', '等待父控件确认时原轮已失效');
        if (!parentsValid(id) || !el.isConnected || resolveContractControl(doc, field).el !== el || readNativeControlValue(el) !== value) return stopped(field, 'failed', '父控件确认期间发生替换或改值');
        if (Date.now() >= deadline) return stopped(field, 'failed', '等待父控件异步确认超时');
        await pause();
      }
      if (!options.stillActive() || !parentsValid(id)) return stopped(field, 'cancelled', '依赖完成时原轮已失效');
      if (findNewAttributableError(doc, el, errorSelectors, errorBaseline)) return stopped(field, 'failed', '父字段出现新增关联校验错误，未放行子字段');
      verified.set(id, { el, value, contract: field });
      return { ...item, dependencyState: 'verified' };
    } catch {
      return stopped(field, 'failed', '依赖就绪或验证失败，未继续子任务');
    }
  }

  for (const id of graph.order) tasks.set(id, execute(byId.get(id)!));
  return Promise.all(fields.map((field) => tasks.get(field.profilePath!)!));
}

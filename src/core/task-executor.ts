// 稳定回读执行器(PLAN v3 · P06)
// 只编排、不重造驱动:对已迁移字段执行 write → immediate read → settle(驱动声明,有界墙钟)→ stable read;
// validation 归因:只处理"新增且可关联当前目标"的可见错误;空/隐藏/原有/他字段错误不归因当前字段。
import { isSemanticEqual, isEmptyValue } from './value-semantics';
import type { ComparePrecision } from './value-semantics';

export interface StableReadbackOptions {
  /** 驱动声明的 settle 等待(ms);默认 0 = 不额外等待。 */
  settleMs?: number;
  /** 稳定复核的墙钟上限(ms);默认 1500。 */
  stableTimeoutMs?: number;
  /** 复核间隔(ms);默认 30。 */
  pollMs?: number;
  /** 是否仍可继续(取消/换代信号)。 */
  stillActive?: () => boolean;
}

export interface StableReadbackResult {
  ok: boolean;
  /** 最后一次读到的值(脱敏使用方自行处理,不落日志)。 */
  readValue: string;
  settleSkipped: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 功能:执行"写后稳定回读"——写入后先即时读,再按 settle 等待后稳定读,直到连续两次一致或超时。
 * 说明:组件驱动自行完成真实写入(本函数不写值);compare 按驱动语义(文本/日期精度)。
 */
export async function stableReadback(
  readValue: () => string,
  compare: (a: string, b: string, precision?: ComparePrecision) => boolean,
  target: string,
  precision: ComparePrecision,
  options: StableReadbackOptions = {},
): Promise<StableReadbackResult> {
  const pollMs = options.pollMs ?? 30;
  const stableTimeoutMs = options.stableTimeoutMs ?? 1500;
  const stillActive = options.stillActive ?? (() => true);
  let last = readValue();
  const immediateOk = compare(last, target, precision);
  if (options.settleMs) {
    const waited = await settleWithBound(options.settleMs, pollMs, stillActive);
    if (!stillActive()) return { ok: false, readValue: last, settleSkipped: true };
    if (!waited) return { ok: compare(readValue(), target, precision), readValue: readValue(), settleSkipped: true };
  }
  if (!immediateOk && options.settleMs) {
    // 即时未达:给异步刷新一点机会(与日期 350ms 自愈同一思想,但由 driver 声明预算)。
    const deadline = Date.now() + stableTimeoutMs;
    while (Date.now() < deadline && stillActive()) {
      await sleep(pollMs);
      const cur = readValue();
      if (compare(cur, target, precision)) {
        // 再确认一次稳定(防"写对又重置")。
        await sleep(pollMs);
        const again = readValue();
        return { ok: compare(again, target, precision), readValue: again, settleSkipped: false };
      }
      last = cur;
    }
    return { ok: false, readValue: last, settleSkipped: false };
  }
  if (immediateOk && options.settleMs) {
    // 即时已达:等待 settle 后复读一次,防受控组件异步清空。
    const deadline = Date.now() + stableTimeoutMs;
    await sleep(options.settleMs);
    while (Date.now() < deadline && stillActive()) {
      const cur = readValue();
      if (compare(cur, target, precision)) return { ok: true, readValue: cur, settleSkipped: false };
      await sleep(pollMs);
    }
    return { ok: false, readValue: readValue(), settleSkipped: false };
  }
  return { ok: immediateOk, readValue: last, settleSkipped: false };
}

/** 功能:有界等待 settle(可被取消打断;返回 false 表示超预算但未取消)。 */
async function settleWithBound(waitMs: number, pollMs: number, stillActive: () => boolean): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!stillActive()) return false;
    await sleep(Math.min(pollMs, 50));
  }
  return true;
}

/**
 * 功能:validation 错误归因——只把"本轮新增可见且能关联到目标控件"的错误算到当前字段。
 * 规则(P06):空容器/隐藏容器/基线已有错误/与目标无关联的错误都不归因;无法归因返回 null(由调用方记 page warning)。
 */
export function attributableValidationError(
  doc: Document,
  target: Element,
  containerSelector: string | undefined,
  baselineErrors: string[],
): { text: string; isNew: boolean } | null {
  if (!containerSelector) return null;
  let container: Element | null = null;
  try {
    container = doc.querySelector(containerSelector);
  } catch {
    return null;
  }
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const hidden = rect.width === 0 && rect.height === 0;
  if (hidden) return null;
  const visibleTexts = Array.from(container.querySelectorAll<HTMLElement>('div,span,li,p,.el-form-item__error,.layui-form-mid'))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const display = el.ownerDocument.defaultView ? el.ownerDocument.defaultView.getComputedStyle(el).display : '';
      return (r.width > 0 || r.height > 0) && display !== 'none' && (el.textContent || '').trim().length > 0;
    })
    .map((el) => (el.textContent || '').trim());
  // F06 修正:无关联证据时绝不回退到"任意可见错误"(审查指出该回退会把他字段错误归因本字段)。
  // G06:错误容器可能只有直接文本节点(无子元素)——容器自身文本也作为候选。
  if (!visibleTexts.length) {
    const own = (container.textContent || '').trim();
    if (own) visibleTexts.push(own);
  }
  // 优先接受控件显式关联的错误容器；错误文案无需包含内部字段 ID。
  const errorIds = `${target.getAttribute('aria-describedby') || ''} ${target.getAttribute('aria-errormessage') || ''}`.trim().split(/\s+/);
  const explicitlyLinked = !!container.id && errorIds.includes(container.id);
  const related = visibleTexts.filter((text) => {
    if (text.length === 0) return false;
    if (explicitlyLinked) return true;
    const labelLike = (target.getAttribute('name') || target.getAttribute('id') || '').toLowerCase();
    if (!labelLike) return false;
    // H04:短 id/name 不得作为子串命中其他字段的错误文案——按词边界匹配(ASCII 字母数字之外为边界)。
    const escaped = labelLike.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
    } catch {
      return false;
    }
  });
  if (!related.length) return null;
  const merged = related.join('|');
  const isNew = baselineErrors.every((b) => merged !== b);
  return { text: merged.slice(0, 200), isNew };
}

/** 功能:取字段可读值(空值语义与驱动一致;select 取 option 文本以匹配"名称等价")。 */
export function readFieldValue(el: Element): string {
  const tag = el.tagName;
  if (tag === 'SELECT') {
    const sel = el as HTMLSelectElement;
    const opt = sel.selectedOptions[0];
    return opt ? (opt.text || opt.value) : '';
  }
  if (tag === 'TEXTAREA') return (el as HTMLTextAreaElement).value;
  const input = el as HTMLInputElement;
  if (input.type === 'radio' || input.type === 'checkbox') return input.checked ? (input.value || 'on') : '';
  return input.value;
}

/** 功能:空值判定(供执行器在写前复用;'0' 不算空)。 */
export function isFieldEmptyValue(value: string): boolean {
  return isEmptyValue(value);
}

export { isSemanticEqual };

/**
 * 功能:稳定回读校正(纯逻辑)——找出"本轮写入但当前值已偏离写入快照"的 filled 项。
 * 场景:受控组件在后续事件循环/异步刷新中清空或改写字段;最终补填轮次后仍未恢复即为"未稳定接受"。
 */
export function stableVerifyWritten<T extends { status?: string; el?: Element | null }>(
  items: T[],
  getOwned: (el: Element) => string | undefined,
  readValue: (el: Element) => string,
): T[] {
  const out: T[] = [];
  for (const it of items) {
    if (it.status !== 'filled' || !it.el) continue;
    const owned = getOwned(it.el);
    if (owned === undefined) continue;
    if (String(readValue(it.el)).trim() !== String(owned).trim()) out.push(it);
  }
  return out;
}

/**
 * 功能:G03 在全部声明的校验容器中查找"写后新增且与目标关联"的错误(处理多个选择器)。
 * 返回首个命中;无关联/隐藏/基线已有错误一律不返回。
 */
export function findNewAttributableError(
  doc: Document,
  target: Element,
  selectors: string[],
  baselineErrors: string[],
): { text: string; isNew: boolean; selector: string } | null {
  for (const selector of selectors) {
    const hit = attributableValidationError(doc, target, selector, baselineErrors);
    if (hit && hit.isNew) return { ...hit, selector };
  }
  return null;
}

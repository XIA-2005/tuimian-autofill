// 整链填充编排(PLAN v5 · G00/G01)
// 职责:合同解析 → 认领登记 → 通用填充 → 结果合并 的唯一生产编排入口。
// content 与自动化测试都调用本函数,避免"helper 通过但整链绕过"(审查 V01–V03 根因)。
import type { Profile } from './profile';
import type { SchoolAdapterPackage } from './adapters';
import { fillAdapterContract, resolveContractControl } from './control-drivers';
import type { ContractFillItem } from './control-drivers';
import { beginWriteScope, endWriteScope, fillAll } from './filler';
import type { FillResult } from './filler';
import type { FieldRule } from './matcher';
import { buildClaimedTargets, mergeContractFillResult } from './fill-merge';
import { resolveAdapterPage } from './adapter-packages';
import { fillAdapterContractAsync } from './dependency-executor';
import type { RunSnapshot } from './fill-session';

export interface PipelineOptions {
  validationBaseline?: string[];
  /** 异步入口的原轮校验；不得在等待后改读新轮的权限。 */
  stillActive?: () => boolean;
  rules?: FieldRule[];
  resetPickerAttempts?: boolean;
  /** 适配包(由调用方解析:生产用 matchAdapterPackage 语义,测试可注入受控包)。 */
  adapterPackage?: SchoolAdapterPackage;
  /** H02:本轮快照(写入记录与恢复都绑定它;缺省时记录只绑定当前文档代际/修订)。 */
  run?: RunSnapshot;
}

/** 功能:H00 判定该页面合同是否声明了依赖字段(声明式依赖必须由异步执行器调度)。 */
function pageHasDependencies(adapter: SchoolAdapterPackage, doc: Document, url: string): boolean {
  const page = resolveAdapterPage(adapter, doc, url).winner?.page;
  return !!page?.fields?.some((field) => field.dependsOn?.length);
}

/**
 * 功能:H00 同步入口遇依赖页时只返回"待异步处理"的阻塞结果并认领控件。
 * 说明:绝不按声明顺序抢写——父未确认前写子、或绕过异步就绪等待都会写错数据。
 */
function blockedDependencyItems(doc: Document, adapter: SchoolAdapterPackage, url: string): ContractFillItem[] {
  const page = resolveAdapterPage(adapter, doc, url).winner?.page;
  if (!page?.fields?.length) return [];
  return page.fields
    .filter((field) => !!field.profilePath)
    .map((field) => {
      const resolved = resolveContractControl(doc, field);
      return {
        profilePath: field.profilePath as string,
        status: 'failed' as const,
        dependencyState: 'blocked' as const,
        reason: '页面含声明式依赖字段,须由异步执行器调度;同步入口不得抢写',
        el: resolved.el,
        ambiguousNodes: resolved.candidates,
      };
    });
}

function emptyFillResult(): FillResult {
  return { items: [], stats: { total: 0, filled: 0, failed: 0, skipped: 0, noMatch: 0, profileEmpty: 0, picker: 0, pickerResumeCount: 0 } };
}

/** 功能：含依赖页面使用可取消调度；无依赖保持原有同步驱动和完整通用填写覆盖。 */
export async function runFillPipelineAsync(
  profile: Profile, doc: Document, url: string, options: PipelineOptions = {},
): Promise<PipelineTrace> {
  const stillActive = options.stillActive ?? (() => true);
  const adapter = options.adapterPackage;
  const page = adapter ? resolveAdapterPage(adapter, doc, url).winner?.page : undefined;
  const emptyResult = emptyFillResult();
  if (!stillActive()) return { result: emptyResult, contractItems: [] };
  if (!adapter || !page?.fields?.some((f) => f.dependsOn?.length)) return runFillPipeline(profile, doc, url, options);
  // 写入作用域只覆盖同步写入，绝不能跨 await 挂在模块全局，否则交错轮次会互相清除/冒用。
  const contractItems = await fillAdapterContractAsync(profile, doc, url, adapter, { stillActive, validationBaseline: options.validationBaseline, run: options.run });
  if (!stillActive()) return { result: emptyResult, contractItems, packageId: adapter.id };
  beginWriteScope(doc, options.run);
  try {
    const claimed = buildClaimedTargets(contractItems);
    const result = fillAll(profile, doc, options.rules, { resetPickerAttempts: options.resetPickerAttempts, excludeEl: (el) => claimed.has(el) });
    return { result: mergeContractFillResult(result, contractItems), contractItems, packageId: adapter.id };
  } finally {
    endWriteScope();
  }
}

export interface PipelineTrace {
  result: FillResult;
  contractItems: ContractFillItem[];
  packageId?: string;
}

/**
 * 功能:执行一次完整填充编排(合同 → 认领 → 通用 → 合并)。
 * 说明:本函数是生产唯一入口;任何"只在 helper 上加保护"的改动都必须同时反映到这里,
 * 否则整链仍可绕过。
 */
export function runFillPipeline(
  profile: Profile,
  doc: Document,
  url: string,
  options: PipelineOptions = {},
): PipelineTrace {
  const adapterPackage = options.adapterPackage;
  // H00:同步入口不得抢写含依赖字段的页面——必须由 runFillPipelineAsync 调度;
  // 这里只返回"待异步处理"的阻塞结果并认领控件,通用链也不得绕过。
  if (adapterPackage && pageHasDependencies(adapterPackage, doc, url)) {
    const blocked = blockedDependencyItems(doc, adapterPackage, url);
    return {
      result: mergeContractFillResult(emptyFillResult(), blocked),
      contractItems: blocked,
      packageId: adapterPackage.id,
    };
  }
  beginWriteScope(doc, options.run);
  try {
    const contractItems = fillAdapterContract(profile, doc, url, adapterPackage);
    const claimed = buildClaimedTargets(contractItems);
    const result = fillAll(profile, doc, options.rules, {
      resetPickerAttempts: options.resetPickerAttempts,
      excludeEl: (el) => claimed.has(el),
    });
    return {
      result: mergeContractFillResult(result, contractItems),
      contractItems,
      packageId: adapterPackage?.id,
    };
  } finally {
    endWriteScope();
  }
}

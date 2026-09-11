// FillTask 设计契约(PLAN v3 · P02/P03 引入;P05 前不进入生产执行链)
// 职责:只声明类型与纯工具;不执行 DOM 写、不读档案值、不产生副作用。
// 说明:候选/任务编译与控件级候选解析在 task-compiler.ts;包/页候选在 adapter-packages.ts
// (两者共享 URL/指纹基础,避免循环依赖)。本模块类型被 P03+ 逐步消费。
import { fixedFieldLabel, safeDiagnosticField, safeDiagnosticStatus } from './fill-telemetry';
import { ISSUE_CATALOG } from './error-codes';

/** 逻辑目标结果状态(与 UI/统计共享同一枚举,禁止局部改义)。 */
export type Outcome =
  | 'pending'
  | 'written'
  | 'alreadyCorrect'
  | 'conflict'
  | 'blocked'
  | 'waitingUser'
  | 'failed'
  | 'cancelled';

/** 问题影响范围:字段级/依赖子树/整页/整轮。 */
export type IssueScope = 'field' | 'dependency' | 'page' | 'run';

/** 单条可写任务:本轮唯一 id;targetRefId 指向内存 registry,绝不序列化 Element。 */
export interface FillWriteItem {
  /** 本轮唯一逻辑目标任务 ID。 */
  id: string;
  /** 内存 registry 引用键(元素本体不入消息、不入存储)。 */
  targetRefId: string;
  profilePath: string;
  /** 每条任务的写入授权来源,不放在 task 顶层。 */
  authority: 'contract' | 'legacyRule';
  driverId: string;
  /** 依赖的父任务 ID 列表(P09 起消费)。 */
  dependsOnIds: string[];
}

/** 一轮填充的作用域:任何异步恢复/回读前必须重新校验。 */
export interface FillRunScope {
  runId: string;
  /** Document 代际:同一 frame 内 document 重建即变化。 */
  documentEpoch: string;
  /** 脱敏逻辑页标识(origin+pathname),不是 location.href,不含 query/hash/令牌。 */
  routeKey: string;
  packageId?: string;
  packageVersion?: string;
  pageId?: string;
  /** 运行内 profile 修订号(不含资料本身;资料变化应使旧任务失效)。 */
  profileRevision: string;
}

/** 功能:从原始 URL 计算脱敏路由键。
 * F04:origin 域名小写(主机大小写不敏感);pathname 保留原样大小写(不擅自合并大小写);
 * 去掉 query(绝不把动态 token/私密段带入);hash 仅以不透明摘要参与身份(hash 路由变化能失效)。
 */
export function routeKeyFor(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    // G04:只保留 origin + 不透明摘要——pathname/query/hash 原文(可能含会话令牌)绝不进入路由键。
    // 合法路由变化(pathname/search/hash 任一不同)仍能产生不同键,使旧轮失效。
    const identity = `${u.pathname}${u.search}${u.hash}`;
    return `${u.origin.toLowerCase()}#r${hashOpaque(identity)}`;
  } catch {
    return '';
  }
}

function hashOpaque(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** 功能:生成一轮运行的作用域对象;runId 由调用方保证唯一。 */
export function makeRunScope(input: Omit<FillRunScope, 'routeKey'> & { url: string }): FillRunScope {
  return {
    runId: input.runId,
    documentEpoch: input.documentEpoch,
    routeKey: routeKeyFor(input.url),
    packageId: input.packageId,
    packageVersion: input.packageVersion,
    pageId: input.pageId,
    profileRevision: input.profileRevision,
  };
}

/** 功能:比较两个作用域是否同轮同页同代(任一关键字段不同即视为已失效)。 */
export function sameFillRunScope(a: FillRunScope | null | undefined, b: FillRunScope | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.runId === b.runId &&
    a.documentEpoch === b.documentEpoch &&
    a.routeKey === b.routeKey &&
    a.packageId === b.packageId &&
    a.packageVersion === b.packageVersion &&
    a.pageId === b.pageId &&
    a.profileRevision === b.profileRevision
  );
}

/** 功能:判定结果是否计入"本轮实际写入"(alreadyCorrect 不算写入)。 */
export function isActualWrite(outcome: Outcome): boolean {
  return outcome === 'written';
}

/** 功能:判定结果是否计入"本轮所有权"(写入成功、等待人工、冲突、blocked、失败都占用目标,禁止他人覆盖)。 */
export function holdsClaim(outcome: Outcome): boolean {
  return outcome === 'written' || outcome === 'waitingUser' || outcome === 'conflict' || outcome === 'blocked' || outcome === 'failed';
}

export interface PlainFillItemDto {
  label: string;
  field: string | null;
  status: string;
  reason?: string;
  issueCode?: string;
}

/** 功能:F05 DTO 白名单构造——显式只放行固定字段标签/field/status/issueCode;
 * valuePreview/pickerContext/expectedCode/el/完整 URL 一律不进入消息与持久化(不依赖类型系统脱敏)。
 * H05:label 改用固定字段标签(不含页面标签原文),reason 不跨上下文传输——页面文本/资料值可能藏在其中。 */
export function toPlainFillItem(item: {
  label: string;
  field: string | null;
  status: string;
  reason?: string;
  issueCode?: string;
  valuePreview?: string;
  pickerContext?: unknown;
  el?: unknown;
}): PlainFillItemDto {
  const field = safeDiagnosticField(item.field);
  const out: PlainFillItemDto = { label: fixedFieldLabel(field), field, status: safeDiagnosticStatus(item.status) };
  if (item.issueCode && ISSUE_CATALOG[item.issueCode]) out.issueCode = item.issueCode;
  return out;
}

// 轮次/文档作用域(PLAN v3 · P05)
// 每个显式点击分配 runId;每个 Document 维护代际 epoch;profile 修订为稳定计数(不以 normalize 时间戳 hash)。
// 会话级计数存 sessionStorage(随页面/回发保留但按 tab 隔离),不存任何真实值。
import { routeKeyFor } from './fill-task';

export { routeKeyFor };

// F04:文档实例身份——同一 URL 的不同 Document 实例必须不可混淆(默认取实例级 id,而非共享 sessionStorage 计数)。
// H03:每次内容脚本/Document 实例初始化生成随机实例令牌,不再用进程内递增数冒充跨导航身份(旧实例重载后不得复用 doc1)。
const docIdentities = new WeakMap<Document, string>();
let nextDocIdentity = 1;
const instanceToken = (() => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  } catch {
    /* 降级到时间戳+随机数 */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
})();
export function documentIdentity(doc: Document): string {
  let id = docIdentities.get(doc);
  if (id === undefined) {
    id = `doc_${instanceToken}_${nextDocIdentity++}`;
    docIdentities.set(doc, id);
  }
  return id;
}

function readCounter(doc: Document, key: string, fallback: number): number {
  try {
    const raw = doc.defaultView?.sessionStorage?.getItem(key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeCounter(doc: Document, key: string, value: number): void {
  try {
    doc.defaultView?.sessionStorage?.setItem(key, String(value));
  } catch {
    /* sessionStorage 不可用时仅内存降级 */
  }
}

/** 功能:生成唯一 runId(优先 crypto.randomUUID)。 */
export function makeRunId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `run_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  } catch {
    /* 降级到时间戳+随机数 */
  }
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 功能:读取当前文档代际计数(默认 1;pagehide/导航时由调用方 bump;仅作同实例内辅助)。 */
export function currentDocumentEpoch(doc: Document): number {
  return readCounter(doc, 'tui-doc-epoch', 1);
}

/** 功能:文档代际 +1(整页回发/导航后内容脚本恢复时调用)。 */
export function bumpDocumentEpoch(doc: Document): number {
  const next = currentDocumentEpoch(doc) + 1;
  writeCounter(doc, 'tui-doc-epoch', next);
  return next;
}

/** 功能:当前 profile 修订(稳定计数;真实资料变更时 bump,避免对 normalize 时间字段重 hash 造成误取消)。 */
export function currentProfileRevision(doc: Document): number {
  return readCounter(doc, 'tui-profile-revision', 1);
}

/** 功能:profile 修订 +1(收到 profile 存储变更/规则变更时调用)。 */
export function bumpProfileRevision(doc: Document): number {
  const next = currentProfileRevision(doc) + 1;
  writeCounter(doc, 'tui-profile-revision', next);
  return next;
}

export interface RunSnapshot {
  runId: string;
  epoch: string;
  routeKey: string;
  profileRevision: number;
  /** G04:捕获时的适配包身份与版本(包升级使旧轮失效)。 */
  packageId?: string;
  packageVersion?: string;
}

/** 功能:拍摄当前运行快照(一次显式 FILL 开始时调用)。 */
export function captureRunSnapshot(doc: Document, url: string, runId?: string, pkg?: { id?: string; version?: string }): RunSnapshot {
  return {
    runId: runId || makeRunId(),
    // F04:epoch = 文档实例身份(不同实例天然不同),同实例内可叠加代际计数供诊断。
    epoch: `${documentIdentity(doc)}:${currentDocumentEpoch(doc)}`,
    routeKey: routeKeyFor(url),
    profileRevision: currentProfileRevision(doc),
    packageId: pkg?.id,
    packageVersion: pkg?.version,
  };
}

/** 功能:异步恢复/继续前校验快照仍有效(同 runId/同代际/同路由/同档案修订;导航或新轮次即失效)。 */
export function isRunSnapshotValid(snapshot: RunSnapshot, doc: Document, url: string): boolean {
  if (!snapshot) return false;
  if (snapshot.routeKey !== routeKeyFor(url)) return false;
  if (snapshot.epoch !== `${documentIdentity(doc)}:${currentDocumentEpoch(doc)}`) return false;
  if (snapshot.profileRevision !== currentProfileRevision(doc)) return false;
  return true;
}

/** 功能:同轮判断(消息/回调带 runId 时先比对,防止旧轮结果串入新轮)。 */
export function isSameRun(snapshot: RunSnapshot | null | undefined, runId: string | undefined): boolean {
  if (!snapshot || !runId) return false;
  return snapshot.runId === runId;
}

/**
 * 功能:G04 生产守卫——"排队时捕获的原轮"是否仍然有效。
 * 判定:① 存在原轮快照;② 当前活跃轮若已换成别的轮次则失效;③ 原轮快照本身仍有效(文档/路由/档案修订)。
 * 说明:本函数是 content.runStillActive 的唯一实现,禁止调用方改用"读取当前全局"的写法。
 */
export function isRunStillActive(
  queued: RunSnapshot | null | undefined,
  current: RunSnapshot | null | undefined,
  doc: Document,
  url: string,
): boolean {
  if (!queued) return false;
  if (current && current.runId !== queued.runId) return false;
  return isRunSnapshotValid(queued, doc, url);
}

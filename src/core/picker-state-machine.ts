// 弹窗字段点选状态机：每个 picker 字段独立维护一个状态。
// 跨 page reload 通过 sessionStorage 持久化进度（"断点续填"）。
//
// 状态机：
//   idle → opening → searching → clicking → verifying → done / failed
//   - done：单次 session 内成功
//   - failed：attempt 达上限 3，标 'failed'，由外层填 'skipped' 转人工
//   - manual：用户已接管或主动跳过；本轮禁止自动重试，下次主动填写恢复 opening
//
// reset 语义：用户主动点击"一键填充"时清零（reset-on-click 行为，与 rowJobsDebug 对齐）。
// sessionStorage key: tui-picker-state
// 形状：
//   {
//     at: number,
//     pickers: {
//       [fieldId]: {
//         state: 'idle' | 'opening' | 'searching' | 'clicking' | 'verifying' | 'done' | 'failed',
//         attempt: number,    // 已失败次数（success 不计）
//         lastError?: string, // 上一次失败原因（仅日志，不用于逻辑分支）
//         updatedAt: number,
//         value?: string,      // pickerContext 还原用的字段值快照
//         context?: PopupPickContext,  // 完整 pickerContext 快照
//       },
//     },
//   }
//
// 命名空间与 dynamic-table 一致：tui-* 前缀 + JSON 序列化。

import { PopupPickContext } from './popup-binding';

export type PickerStateName =
  | 'idle'
  | 'opening'
  | 'searching'
  | 'clicking'
  | 'verifying'
  | 'manual'
  | 'done'
  | 'failed';

export interface PickerStateRecord {
  state: PickerStateName;
  attempt: number;
  lastError?: string;
  updatedAt: number;
  /** 字段值快照（用于 fail 后重试时还原） */
  value?: string;
  /** 完整 pickerContext 快照（用于断点续填） */
  context?: PopupPickContext;
}

export interface PickerStateSnapshot {
  at: number;
  pickers: Record<string, PickerStateRecord>;
}

const STORAGE_KEY = 'tui-picker-state';
/** 失败上限：连续失败 3 次后转 manual；与 picker 旧版行为一致 */
export const MAX_PICKER_ATTEMPT = 3;
/** sessionStorage 容量保护：单页 picker 数量超过此值就截断旧的失败记录（LRU by updatedAt） */
const MAX_PICKERS = 200;

type SessionLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStore(doc?: Document | null): SessionLike | null {
  try {
    // 优先用页面上下文的 sessionStorage（支持测试中用 jsdom window 模拟）
    const w = doc?.defaultView;
    if (w?.sessionStorage) return w.sessionStorage as SessionLike;
    // Node.js / 无 DOM 环境：全局 sessionStorage（浏览器扩展 content-script 环境）
    if (typeof sessionStorage !== 'undefined') return sessionStorage as SessionLike;
    return null;
  } catch {
    return null;
  }
}

/** 功能：读取整张状态快照；解析失败或缺失返回空快照。 */
export function loadPickerState(doc?: Document | null): PickerStateSnapshot {
  const store = getStore(doc);
  if (!store) return { at: 0, pickers: {} };
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return { at: 0, pickers: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { at: 0, pickers: {} };
    const pickers = (parsed.pickers && typeof parsed.pickers === 'object') ? parsed.pickers : {};
    // 简单形状校验：只保留 PickerStateRecord 形状
    const cleaned: Record<string, PickerStateRecord> = {};
    for (const [k, v] of Object.entries(pickers)) {
      if (v && typeof v === 'object' && typeof (v as any).state === 'string') {
        const rec = v as PickerStateRecord;
        cleaned[k] = {
          state: rec.state,
          attempt: Number(rec.attempt) || 0,
          lastError: typeof rec.lastError === 'string' ? rec.lastError : undefined,
          updatedAt: Number(rec.updatedAt) || 0,
          value: typeof rec.value === 'string' ? rec.value : undefined,
          context: rec.context && typeof rec.context === 'object' ? rec.context : undefined,
        };
      }
    }
    return { at: Number(parsed.at) || 0, pickers: cleaned };
  } catch {
    return { at: 0, pickers: {} };
  }
}

/** 功能：原子化写入整张快照。空间超出时淘汰最旧失败记录。 */
export function savePickerState(snapshot: PickerStateSnapshot, doc?: Document | null): void {
  const store = getStore(doc);
  if (!store) return;
  try {
    // LRU 截断
    const entries = Object.entries(snapshot.pickers);
    if (entries.length > MAX_PICKERS) {
      entries.sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
      const cut = entries.length - MAX_PICKERS;
      for (let i = 0; i < cut; i++) delete (snapshot.pickers as any)[entries[i][0]];
    }
    snapshot.at = Date.now();
    // P08:落盘只写匿名进度(状态/尝试/时间/错误),不写字段真实值与 pickerContext
    // (value/context 仅在内存与旧版快照中存在;新格式恢复时从当前档案/合同重新生成)。
    const serializable: Record<string, unknown> = { at: snapshot.at, pickers: {} as Record<string, unknown> };
    for (const [fieldId, rec] of Object.entries(snapshot.pickers)) {
      (serializable.pickers as Record<string, unknown>)[fieldId] = {
        state: rec.state,
        attempt: rec.attempt,
        lastError: rec.lastError,
        updatedAt: rec.updatedAt,
      };
    }
    store.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // 忽略（隐私模式 / 序列化异常）
  }
}

/**
 * 功能:P08 picker 代码冲突判定(纯函数)——代码字段已有非空且与期望代码不同时,
 * 视为冲突/需人工,不清用户已有非空值、不自动重开弹窗覆盖。
 */
export function pickerCodeConflictDecision(currentCode: string, expectedCode: string | undefined): 'conflict' | 'ok' | 'missing' {
  const cur = String(currentCode || '').trim();
  if (!expectedCode) return 'missing'; // 无期望代码:交由 picker 正常流程
  if (!cur) return 'ok'; // 页面代码为空:允许自动弹窗选择
  return cur === String(expectedCode).trim() ? 'ok' : 'conflict';
}

/** 功能：标记 picker 进入新状态（state 转移 + attempt 自增只在 failed 时）。 */
export function markPickerStep(
  fieldId: string,
  state: PickerStateName,
  doc?: Document | null,
  error?: string,
): PickerStateRecord {
  const snap = loadPickerState(doc);
  const prev = snap.pickers[fieldId] || { state: 'idle' as PickerStateName, attempt: 0, updatedAt: 0 };
  const next: PickerStateRecord = {
    state,
    // attempt 仅在失败时累加；done 立即清零；其它阶段不增
    attempt: state === 'failed' ? prev.attempt + 1 : state === 'done' ? 0 : prev.attempt,
    updatedAt: Date.now(),
  };
  if (error) next.lastError = error;
  if (prev.value) next.value = prev.value;
  if (prev.context) next.context = prev.context;
  snap.pickers[fieldId] = next;
  savePickerState(snap, doc);
  return next;
}

/**
 * 功能：登记一个新 picker 任务（首次识别或恢复时调用）。
 *  - 写入 state='opening'、attempt 0、清空 lastError
 *  - 缓存 value 和 context 用于后续 markPickerStep
 *  - 如果之前已经 done 或 manual，保持原状态（自动补填不得解除人工接管）
 */
export function startPicker(
  fieldId: string,
  context: PopupPickContext,
  value: string,
  doc?: Document | null,
): PickerStateRecord {
  const snap = loadPickerState(doc);
  const prev = snap.pickers[fieldId];
  // done 不重复激活；manual 只允许由下一次用户主动 reset 恢复，后台补填不得覆盖。
  const baseState: PickerStateName = prev?.state === 'done' || prev?.state === 'manual' ? prev.state : 'opening';
  const rec: PickerStateRecord = {
    state: baseState,
    attempt: 0,
    updatedAt: Date.now(),
    value,
    context,
  };
  snap.pickers[fieldId] = rec;
  savePickerState(snap, doc);
  return rec;
}

/**
 * 功能：查询所有未完成的 picker（state !== 'done'）并按 updatedAt 升序返回。
 * 第二参数 includeDone=true 时返回全部 picker（用于诊断 / reset 后核对 evidence）。
 */
export function getResumablePickers(
  doc?: Document | null,
  options: { includeDone?: boolean } = {},
): Array<{ fieldId: string; record: PickerStateRecord }> {
  const snap = loadPickerState(doc);
  return Object.entries(snap.pickers)
    .filter(([, rec]) => options.includeDone || rec.state !== 'done')
    .sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0))
    .map(([fieldId, record]) => ({ fieldId, record }));
}

/** 功能：标记 picker 成功（重置 attempt=0，state=done）。 */
export function markPickerDone(fieldId: string, doc?: Document | null): void {
  markPickerStep(fieldId, 'done', doc);
}

/** 功能：标记 picker 由用户人工接管；保留在可恢复列表中，但本轮不再自动重试。 */
export function markPickerManual(fieldId: string, reason: string, doc?: Document | null): PickerStateRecord {
  return markPickerStep(fieldId, 'manual', doc, reason);
}

/** 功能：判断 picker 是否处于本轮人工待处理状态。 */
export function isPickerManual(fieldId: string, doc?: Document | null): boolean {
  return loadPickerState(doc).pickers[fieldId]?.state === 'manual';
}

/** 功能：标记 picker 失败（attempt +1，超过 MAX 自动转 failed）。 */
export function markPickerFailed(fieldId: string, error: string, doc?: Document | null): PickerStateRecord {
  const snap = loadPickerState(doc);
  const prev = snap.pickers[fieldId];
  const nextAttempt = (prev?.attempt || 0) + 1;
  const finalState: PickerStateName = nextAttempt >= MAX_PICKER_ATTEMPT ? 'failed' : 'verifying';
  const rec: PickerStateRecord = {
    state: finalState,
    attempt: nextAttempt,
    lastError: error,
    updatedAt: Date.now(),
  };
  if (prev?.value) rec.value = prev.value;
  if (prev?.context) rec.context = prev.context;
  snap.pickers[fieldId] = rec;
  savePickerState(snap, doc);
  return rec;
}

/**
 * 功能：用户主动点击"一键填充"时清零（reset-on-click 行为）。
 * 与 rowJobsDebug.reset-on-click 语义一致：把未完成项的 attempt 清零、保留 state，
 * 让用户从干净状态重新开始但 pickerResumeCount 仍能真实反映"还有几项待重试"。
 */
export function resetActivePickerAttempts(doc?: Document | null): number {
  const snap = loadPickerState(doc);
  let resetCount = 0;
  for (const rec of Object.values(snap.pickers)) {
    if (rec.state === 'manual') {
      // 只有用户主动开始新一轮填写时才调用 reset；人工跳过项因此重新获得一次自动尝试机会。
      rec.state = 'opening';
      rec.attempt = 0;
      rec.lastError = undefined;
      rec.updatedAt = Date.now();
      resetCount++;
    } else if (rec.state !== 'done' && rec.attempt > 0) {
      rec.attempt = 0;
      rec.lastError = undefined;
      rec.updatedAt = Date.now();
      resetCount++;
    }
  }
  if (resetCount > 0) savePickerState(snap, doc);
  return resetCount;
}

/** 功能：清空所有 picker 状态（页面提交后、用户主动全部重置时使用）。 */
export function clearPickerState(doc?: Document | null): void {
  const store = getStore(doc);
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** 功能：判断给定 fieldId 是否已失败且超过重试上限（应转 manual）。 */
export function isPickerExhausted(fieldId: string, doc?: Document | null): boolean {
  const rec = loadPickerState(doc).pickers[fieldId];
  if (!rec) return false;
  return rec.state === 'failed' || rec.attempt >= MAX_PICKER_ATTEMPT;
}

/**
 * 功能:F08a picker 成对角色守卫——比较前先区分代码框/名称框/显示框角色,不得把名称与代码直接比较。
 * code 为空但名称/显示已有内容 → 用户手工输入了名称而缺代码:交给用户,不自动清空合法名称也不自动开弹窗覆盖。
 */
export function pickerPairVerdict(input: {
  code: string;
  expectedCode: string | undefined;
  nameFilled: boolean;
  displayFilled: boolean;
}): 'ok' | 'conflict' | 'missing' {
  const code = String(input.code || '').trim();
  const expected = input.expectedCode ? String(input.expectedCode).trim() : '';
  if (!expected) return 'missing';
  if (code && code !== expected) return 'conflict';
  if (!code && (input.nameFilled || input.displayFilled)) return 'conflict';
  return 'ok';
}

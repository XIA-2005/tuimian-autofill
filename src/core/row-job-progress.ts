// 动态表格断点进度：把“点击新增前的恢复点”和“本轮完成量”分离，避免重复累加跳行。

/**
 * 功能：计算一次动态表格填写后的下一条索引。
 * 原理：nextIndex = max(callStart + processedCount, observedNextIndex)。
 * 注意：点击“新增一行”前保存的恢复点可能在执行期间变化，不能作为本轮加法基数。
 */
export function nextRowJobIndex(callStart: number, processedCount: number, observedNextIndex?: number): number {
  const start = Number.isFinite(callStart) ? Math.max(0, Math.floor(callStart)) : 0;
  const processed = Number.isFinite(processedCount) ? Math.max(0, Math.floor(processedCount)) : 0;
  const observed = Number.isFinite(observedNextIndex)
    ? Math.max(start, Math.floor(observedNextIndex as number))
    : start;
  // 页面原本已有的记录不属于“本轮新写入”，但属于“已处理”；用页面证据防止断点滞后。
  return Math.max(start + processed, observed);
}

/** 连续无进展轮数达到该值才放弃任务（成功一轮即清零；巨能填按"新增失败次数"而非总点击数停止） */
export const ROW_JOB_FAIL_CAP = 5;

export interface RowJobRoundInput {
  callStart: number;
  /** nextRowJobIndex 的结果 */
  nextIndex: number;
  clicked: boolean;
  processed: number;
  /** 本轮开始时目标表行数；-1 表示任务开始时表格不存在 */
  rowsBefore: number;
  /** 本轮结束后目标表行数；-1 表示表格此刻不存在 */
  rowsAfter: number;
  failsBefore: number;
  entriesLength: number;
  /** 此刻目标表是否仍存在于页面 */
  tablePresentNow: boolean;
}

export type RowJobRoundDecision =
  | { action: 'complete' }
  | { action: 'drop-no-table'; remaining: number }
  | { action: 'drop-fails'; remaining: number }
  | { action: 'keep'; fails: number; startIndex: number; warn: boolean };

/**
 * 功能：判定一轮动态表任务之后的走向（完成/放弃/继续）。
 * 原理：只有"目标表确实不在本页"才按无表放弃；表格在但加行无效时保留任务并累计连续失败，
 * 避免把可恢复的加行失败误判成"没有表格"而清除断点（v2.0.1 前 14 条只填 10 条的主因之一）。
 */
export function decideRowJobRound(input: RowJobRoundInput): RowJobRoundDecision {
  const { callStart, nextIndex, clicked, processed, rowsBefore, rowsAfter, failsBefore, entriesLength, tablePresentNow } = input;
  if (nextIndex >= entriesLength) return { action: 'complete' };
  const progressed = nextIndex > callStart || (rowsBefore >= 0 && rowsAfter > rowsBefore);
  const fails = progressed ? 0 : failsBefore + 1;
  if (!clicked && processed === 0 && !tablePresentNow) {
    return { action: 'drop-no-table', remaining: entriesLength - nextIndex };
  }
  if (fails >= ROW_JOB_FAIL_CAP) {
    return { action: 'drop-fails', remaining: entriesLength - nextIndex };
  }
  return { action: 'keep', fails, startIndex: nextIndex, warn: !progressed && fails >= 3 };
}

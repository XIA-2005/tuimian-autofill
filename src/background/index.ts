// 后台 Service Worker：广播填充命令到标签页内所有 frame，聚合各 frame 的填充结果。
// P05:每次显式填充分配 runId;结果按 (frameId, frameSeq) 以最新序号替换,旧轮/迟到结果丢弃;
// 1200ms 去抖仅作"无新回报"的收口窗口,零回报帧不再伪装成功(respond 带 timedOut/framesReported)。

import { FillStats } from '../core/filler';
import { ensureSeed } from '../core/storage';
import { syncRemoteRules } from '../core/rulesync';
import { RunAggregator } from './aggregation';
import type { PlainFillItem } from './aggregation';
import { makeRunId } from '../core/fill-session';
import { fixedFieldLabel, safeDiagnosticField, safeDiagnosticStatus, sanitizeDiagnosticValue } from '../core/fill-telemetry';
import { ISSUE_CATALOG } from '../core/error-codes';

interface Aggregation {
  tabId: number;
  runId: string;
  aggregator: RunAggregator;
  timer: ReturnType<typeof setTimeout> | null;
  /** H03:注册窗口是否已封口;封口前不得仅凭 allTerminal 完成。 */
  sealed: boolean;
  sealTimer: ReturnType<typeof setTimeout> | null;
  /** H03:封口后到达的注册数(明确区分"未覆盖/下一轮",不静默丢弃)。 */
  lateRegistrations: number;
  /** J01:人工暂停预算定时器(全部未终态参与者都在等人工时使用)。 */
  pauseTimer: ReturnType<typeof setTimeout> | null;
  respond?: (resp: unknown) => void;
}

const pending = new Map<number, Aggregation>();

/**
 * I00:已完成轮的有限回执——收口后到达的注册必须得到明确结果(未覆盖/需重试),不得静默丢弃。
 * 有界:TTL 60s、最多保留最近 8 轮、每轮最多记录 32 个晚注册区域;不保留任何 DOM 或资料。
 */
interface RunReceipt {
  tabId: number;
  runId: string;
  finishedAt: number;
  participants: number;
  framesReported: number;
  timedOut: boolean;
  lateRegions: Set<string>;
  coveredRegions: Set<string>;
  coverageComplete: boolean;
}
const receipts = new Map<string, RunReceipt>();
const RECEIPT_TTL_MS = 60_000;
const RECEIPT_CAPACITY = 8;
const RECEIPT_MAX_LATE_REGIONS = 32;

function receiptKey(tabId: number, runId: string): string {
  return `${tabId}::${runId}`;
}

/** 功能:记录已完成轮摘要(带 TTL 与容量上限),供收口后的晚注册查询。 */
function rememberReceipt(agg: Aggregation, summary: { participants: number; framesReported: number; timedOut: boolean }): void {
  const key = receiptKey(agg.tabId, agg.runId);
  receipts.delete(key);
  receipts.set(key, {
    tabId: agg.tabId,
    runId: agg.runId,
    finishedAt: Date.now(),
    participants: summary.participants,
    framesReported: summary.framesReported,
    timedOut: summary.timedOut,
    lateRegions: new Set(),
    coveredRegions: new Set(agg.aggregator.registeredRegions()),
    coverageComplete: agg.aggregator.participantsCount() <= 256,
  });
  const now = Date.now();
  for (const [k, receipt] of receipts) if (now - receipt.finishedAt > RECEIPT_TTL_MS) receipts.delete(k);
  while (receipts.size > RECEIPT_CAPACITY) {
    const oldest = receipts.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    receipts.delete(oldest);
  }
}

// G05:硬上限(须大于子 frame 的 1200ms 级任务;到点只报超时,不代表成功)。
// H03:deadline 必须覆盖 content 的末轮补填预算(2.5s/7s/15s)+ settle 420ms + 稳定验证,否则会把仍在工作的轮次误报超时。
const FILL_DEADLINE_MS = 25000;
// H03:参与者注册封口窗口——FILL 广播后各帧注册消息可能晚于首帧终态到达;
// 窗口关闭前不得完成,避免"第一帧终态即 FILL_DONE,后注册帧被丢弃"。
const REGISTRATION_WINDOW_MS = 700;
// J01:人工接管的暂停预算——等待人工是"可恢复暂停",不是页面失联:
// 全部未终态参与者都在等待人工时,把 25s 硬 deadline 换成这个有界预算;超界才按 waiting-manual 收口。
const MANUAL_PAUSE_BUDGET_MS = 300000;

/** 功能:G05 收口——正常完成只在全部已注册参与者到达终态时发生;deadline 只报超时与 missing。 */
function finishAggregation(tabId: number, agg: Aggregation, reason: 'all-terminal' | 'deadline' | 'manual-timeout'): void {
  if (pending.get(tabId) !== agg) return; // 新轮已替换:旧轮静默过期
  pending.delete(tabId);
  if (agg.timer) clearTimeout(agg.timer);
  if (agg.sealTimer) clearTimeout(agg.sealTimer);
  if (agg.pauseTimer) clearTimeout(agg.pauseTimer);
  // J00:deadline/manual-timeout 到点 → 先向本轮各参与者发 scoped 停止通知,让 content 立即失效原轮,
  // 而不是让回调继续写、最后只报一句"页面无响应"。
  if (reason !== 'all-terminal') stopParticipants(tabId, agg, reason);
  const summary = reason === 'all-terminal' ? agg.aggregator.summarize() : agg.aggregator.summarizeTimeout();
  // J01:暂停预算耗尽 → 未终态区域按"等待人工"类别如实上报(不是页面失联)。
  if (reason === 'manual-timeout') {
    summary.terminalKinds['waiting-manual'] = (summary.terminalKinds['waiting-manual'] || 0) + summary.missing.length;
  }
  const payload = {
    type: 'FILL_DONE',
    stats: summary.stats,
    items: summary.items,
    runId: agg.runId,
    framesReported: summary.framesReported,
    participants: summary.participants,
    missing: summary.missing,
    terminalKinds: summary.terminalKinds,
    timedOut: summary.timedOut,
    finishReason: reason,
    lateRegistrations: agg.lateRegistrations,
  };
  chrome.tabs.sendMessage(tabId, payload, { frameId: 0 }).catch(() => {
    // 顶层 frame 无接收者（如页面刚刷新），忽略
  });
  rememberReceipt(agg, summary); // I00:留下有界回执,收口后的注册不再静默
  if (agg.respond) agg.respond({ ok: true, stats: summary.stats, runId: agg.runId, framesReported: summary.framesReported, timedOut: summary.timedOut });
}

function cancelAggregation(agg: Aggregation): void {
  if (agg.timer) clearTimeout(agg.timer);
  if (agg.sealTimer) clearTimeout(agg.sealTimer);
  if (agg.pauseTimer) clearTimeout(agg.pauseTimer);
  pending.delete(agg.tabId);
}

/**
 * 功能:J01 按"是否全部在等待人工"切换等待策略。
 * 说明:全部暂停 → 撤掉 25s 硬 deadline,改用有界暂停预算(正常人工等待不得报成页面失联);
 * 只要有自动任务在跑 → 恢复硬 deadline。
 */
function refreshWaitPolicy(tabId: number, agg: Aggregation): void {
  if (pending.get(tabId) !== agg) return;
  if (agg.aggregator.pausedOnlyPending()) {
    if (agg.timer) { clearTimeout(agg.timer); agg.timer = null; }
    if (!agg.pauseTimer) {
      agg.pauseTimer = setTimeout(() => finishAggregation(tabId, agg, 'manual-timeout'), MANUAL_PAUSE_BUDGET_MS);
    }
    return;
  }
  if (agg.pauseTimer) { clearTimeout(agg.pauseTimer); agg.pauseTimer = null; }
  if (!agg.timer) agg.timer = setTimeout(() => finishAggregation(tabId, agg, 'deadline'), FILL_DEADLINE_MS);
}

/**
 * 功能:J00 向本轮已注册参与者发送 scoped 停止通知(带 runId 与目标 frameId)。
 * 说明:只对"已注册且尚未终态"的参与者发送;content 侧再核对 run/document 后才失效原轮。
 */
function stopParticipants(tabId: number, agg: Aggregation, reason: 'deadline' | 'manual-timeout'): void {
  for (const participant of agg.aggregator.unterminatedParticipants()) {
    chrome.tabs.sendMessage(tabId, {
      type: 'FILL_STOP',
      runId: agg.runId,
      docId: participant.docId,
      reason,
      message: reason === 'manual-timeout' ? '人工接管等待已到期，本轮已停止' : '本轮填写已超时停止',
    }, { frameId: participant.frameId }).catch(() => {
      // 该 frame 已消失:超时汇总里仍会列为 missing。
    });
  }
}

function startAggregation(tabId: number, respond?: (resp: unknown) => void): string {
  const prev = pending.get(tabId);
  if (prev) {
    // H03:被新轮替换的旧轮是显式"取消"终态类别——旧调用方必须收到取消,不得静默悬挂。
    if (prev.timer) clearTimeout(prev.timer);
    if (prev.sealTimer) clearTimeout(prev.sealTimer);
    if (prev.pauseTimer) clearTimeout(prev.pauseTimer);
    if (prev.respond) prev.respond({ ok: false, reason: 'superseded', runId: prev.runId, terminalKind: 'cancelled' });
    pending.delete(tabId);
  }
  const runId = makeRunId();
  const agg: Aggregation = { tabId, runId, aggregator: new RunAggregator(runId), timer: null, sealed: false, sealTimer: null, lateRegistrations: 0, pauseTimer: null, respond };
  pending.set(tabId, agg);
  // G05:硬 deadline 只产生"部分完成/超时",不再以 1200ms 固定时长充当成功条件。
  agg.timer = setTimeout(() => finishAggregation(tabId, agg, 'deadline'), FILL_DEADLINE_MS);
  // H03:注册窗口封口;封口时若已全部终态则正常完成(不额外延长计时器伪造发现完成)。
  agg.sealTimer = setTimeout(() => {
    agg.sealed = true;
    if (agg.aggregator.allTerminal()) finishAggregation(tabId, agg, 'all-terminal');
  }, REGISTRATION_WINDOW_MS);
  return runId;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureSeed().catch(() => {});
});

// ===== 跨 frame 字段报告聚合（复制字段报告用） =====
interface ReportAgg {
  tabId: number;
  reports: unknown[];
  timer: ReturnType<typeof setTimeout> | null;
  respond?: (resp: unknown) => void;
}
const reportPending = new Map<number, ReportAgg>();

function startReportAggregation(tabId: number, respond?: (resp: unknown) => void): void {
  const prev = reportPending.get(tabId);
  if (prev && prev.timer) clearTimeout(prev.timer);
  const agg: ReportAgg = { tabId, reports: [], timer: null, respond };
  reportPending.set(tabId, agg);
  agg.timer = setTimeout(() => {
    reportPending.delete(tabId);
    if (agg.respond) agg.respond({ ok: true, reports: agg.reports });
  }, 1200);
}

chrome.runtime.onMessage.addListener((msg: any, sender: any, sendResponse: any): boolean => {
  if (!msg) return false;

  if (msg.type === 'SYNC_RULES') {
    syncRemoteRules()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, message: e instanceof Error ? e.message : String(e) }));
    return true;
  }

  if (msg.type === 'PANEL_REPORT' || msg.type === 'REPORT_REQUEST') {
    const tabId = (sender.tab && sender.tab.id) || msg.tabId;
    if (!tabId) {
      sendResponse({ ok: false, reason: 'no-tab' });
      return false;
    }
    startReportAggregation(tabId, sendResponse);
    chrome.tabs.sendMessage(tabId, { type: 'REPORT' }).catch(() => {
      const agg = reportPending.get(tabId);
      if (agg) {
        if (agg.timer) clearTimeout(agg.timer);
        reportPending.delete(tabId);
        agg.respond && agg.respond({ ok: false, reason: 'no-receiver' });
      }
    });
    return true;
  }

  if (msg.type === 'REPORT_RESULT') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId && reportPending.has(tabId)) {
      try {
        reportPending.get(tabId)!.reports.push({ frameId: sender.frameId != null ? sender.frameId : 0, report: sanitizeDiagnosticValue(JSON.parse(msg.report || '{}')) });
      } catch {
        // 忽略坏数据
      }
    }
    return false;
  }

  if (msg.type === 'PANEL_FILL' || msg.type === 'FILL_REQUEST') {
    const tabId = (sender.tab && sender.tab.id) || msg.tabId;
    if (!tabId) {
      sendResponse({ ok: false, reason: 'no-tab' });
      return false;
    }
    void (async () => {
      let dispatchedRunId: string | undefined;
      try {
        dispatchedRunId = startAggregation(tabId, sendResponse);
        await chrome.tabs.sendMessage(tabId, { type: 'FILL', runId: dispatchedRunId });
      } catch {
        const agg = pending.get(tabId);
        if (!agg || agg.runId !== dispatchedRunId) return; // 旧广播失败不能取消其后启动的新轮。
        cancelAggregation(agg);
        sendResponse({ ok: false, reason: 'no-receiver' });
      }
    })();
    return true;
  }

  if (msg.type === 'FILL_REGISTER') {
    const tabId = sender.tab && sender.tab.id;
    if (typeof msg.runId !== 'string' || !msg.runId || typeof msg.docId !== 'string' || !msg.docId) return false;
    if (tabId && pending.has(tabId)) {
      const agg = pending.get(tabId)!;
      if (msg.runId !== agg.runId) {
        sendResponse({ ok: false, reason: 'different-active-run', runId: msg.runId });
        return false;
      }
      // H03:封口后到达的注册仍登记,但计入 lateRegistrations(明确区分,不静默丢弃)。
      const newlyRegistered = agg.aggregator.register(sender.frameId != null ? sender.frameId : -1, msg.docId);
      if (agg.sealed && newlyRegistered) agg.lateRegistrations += 1;
      if (agg.sealed && agg.aggregator.allTerminal()) finishAggregation(tabId, agg, 'all-terminal');
      else refreshWaitPolicy(tabId, agg); // 新加入的自动区域不能继续使用人工暂停预算。
    } else if (tabId) {
      // I00:该轮已收口(或未知轮)——必须给出明确回执;不得静默丢弃,也不得重开已取消轮或混入新轮统计。
      const frameId = sender.frameId != null ? sender.frameId : -1;
      const regionKey = `${frameId}::${msg.docId}`;
      const receipt = receipts.get(receiptKey(tabId, msg.runId));
      if (receipt && Date.now() - receipt.finishedAt <= RECEIPT_TTL_MS) {
        if (receipt.coveredRegions.has(regionKey)) {
          sendResponse({ ok: true, reason: 'already-completed', runId: msg.runId, covered: true });
          return false;
        }
        // 覆盖摘要或晚注册计数到达容量后明确降级；不能因未存入Set就对同一消息反复通知。
        if (!receipt.coverageComplete || (!receipt.lateRegions.has(regionKey) && receipt.lateRegions.size >= RECEIPT_MAX_LATE_REGIONS)) {
          sendResponse({ ok: false, reason: 'receipt-capacity', runId: msg.runId, covered: null, lateRegions: receipt.lateRegions.size });
          return false;
        }
        const isNewRegion = !receipt.lateRegions.has(regionKey);
        if (isNewRegion && receipt.lateRegions.size < RECEIPT_MAX_LATE_REGIONS) receipt.lateRegions.add(regionKey);
        if (isNewRegion) {
          // 该区域:明确"本轮未覆盖"
          chrome.tabs.sendMessage(tabId, {
            type: 'FILL_LATE_REGISTRATION',
            runId: msg.runId,
            message: '本轮已收口,该区域未计入本轮结果;请重新点击「一键填充」',
          }, { frameId }).catch(() => {});
          // 顶层可见:本轮存在未覆盖区域(按新区域计数,不按消息次数)
          chrome.tabs.sendMessage(tabId, {
            type: 'FILL_ROUND_NOTICE',
            runId: msg.runId,
            lateRegions: receipt.lateRegions.size,
            message: `有 ${receipt.lateRegions.size} 个区域在收口后注册(未计入本轮,请重新填充)`,
          }, { frameId: 0 }).catch(() => {});
        }
        sendResponse({ ok: false, reason: 'run-completed', runId: msg.runId, covered: false, lateRegions: receipt.lateRegions.size });
      } else {
        sendResponse({ ok: false, reason: 'unknown-run', runId: msg.runId });
      }
    }
    return false;
  }

/** 功能:G05 DTO 接收端白名单——无论发送端如何,只保留固定字段标签/field/status/issueCode。
 * H05:接收端同样不信任 label 原文与 reason(可能携带页面资料/令牌),只按 field 生成固定标签。 */
function sanitizeItems(raw: unknown): PlainFillItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlainFillItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const field = safeDiagnosticField(it.field);
    const entry: PlainFillItem = {
      label: fixedFieldLabel(field),
      field,
      status: safeDiagnosticStatus(it.status),
    };
    if (typeof it.issueCode === 'string' && ISSUE_CATALOG[it.issueCode]) entry.issueCode = it.issueCode;
    out.push(entry);
  }
  return out;
}

  if (msg.type === 'FILL_PAUSE') {
    // J01:等待人工接管 = 可恢复暂停(不是终态)。保留轮次与已收结果,把硬 deadline 换成暂停预算。
    const tabId = sender.tab && sender.tab.id;
    if (typeof msg.runId !== 'string' || !msg.runId || typeof msg.docId !== 'string' || !msg.docId) return false;
    if (!Number.isSafeInteger(msg.frameSeq) || msg.frameSeq < 1) { sendResponse({ ok: false, reason: 'invalid-sequence' }); return false; }
    if (tabId && pending.has(tabId)) {
      const agg = pending.get(tabId)!;
      const frameId = sender.frameId != null ? sender.frameId : -1;
      const report = {
        runId: msg.runId,
        frameId,
        docId: msg.docId,
        frameSeq: msg.frameSeq,
        stats: msg.stats as FillStats,
        items: sanitizeItems(msg.items),
        terminalKind: 'done' as const,
      };
      if (agg.aggregator.setPaused(report, true)) {
        refreshWaitPolicy(tabId, agg);
        sendResponse({ ok: true, paused: true, runId: agg.runId });
      } else {
        sendResponse({ ok: false, reason: 'not-paused', runId: agg.runId });
      }
    } else {
      sendResponse({ ok: false, reason: 'unknown-run' });
    }
    return true;
  }

  if (msg.type === 'FILL_RESUME') {
    // J01:人工完成 → 该区域恢复自动工作;重新按"是否有自动任务在跑"决定等待策略。
    const tabId = sender.tab && sender.tab.id;
    if (typeof msg.runId !== 'string' || !msg.runId || typeof msg.docId !== 'string' || !msg.docId) return false;
    if (!Number.isSafeInteger(msg.frameSeq) || msg.frameSeq < 1) { sendResponse({ ok: false, reason: 'invalid-sequence' }); return false; }
    if (tabId && pending.has(tabId)) {
      const agg = pending.get(tabId)!;
      const report = {
        runId: msg.runId,
        frameId: sender.frameId != null ? sender.frameId : -1,
        docId: msg.docId,
        frameSeq: msg.frameSeq,
        stats: msg.stats as FillStats,
        items: sanitizeItems(msg.items),
      };
      const ok = agg.aggregator.setPaused(report, false);
      if (ok) refreshWaitPolicy(tabId, agg);
      sendResponse({ ok, runId: agg.runId });
    } else {
      sendResponse({ ok: false, reason: 'unknown-run' });
    }
    return true;
  }

  if (msg.type === 'FILL_RESULT' || msg.type === 'FILL_TERMINAL') {
    const tabId = sender.tab && sender.tab.id;
    // G05:runId/docId/frameSeq 缺一即拒(不得用当前 runId 填补缺失)。
    if (typeof msg.runId !== 'string' || !msg.runId || typeof msg.frameSeq !== 'number' || !Number.isFinite(msg.frameSeq) || msg.frameSeq < 1 || typeof msg.docId !== 'string' || !msg.docId) return false;
    if (tabId && pending.has(tabId)) {
      const agg = pending.get(tabId)!;
      const frameId = sender.frameId != null ? sender.frameId : -1;
      const report = {
        runId: msg.runId,
        frameId,
        docId: msg.docId,
        frameSeq: msg.frameSeq,
        stats: msg.stats as FillStats,
        items: sanitizeItems(msg.items),
        // H03:终态类别白名单(缺省 done;非法值一律按 done)。
        terminalKind: msg.terminalKind === 'waiting-manual' || msg.terminalKind === 'cancelled' ? msg.terminalKind : 'done',
      };
      if (msg.type === 'FILL_TERMINAL') agg.aggregator.terminalize(report);
      else agg.aggregator.accept(report);
      // H03:必须等注册窗口封口后才可正常完成——封口前完成会把晚注册帧静默丢弃。
      if (agg.sealed && agg.aggregator.allTerminal()) finishAggregation(tabId, agg, 'all-terminal');
      else refreshWaitPolicy(tabId, agg); // J01:有自动任务在跑 → 恢复硬 deadline;全部等人工 → 暂停预算
    }
    return false;
  }

  return false;
});

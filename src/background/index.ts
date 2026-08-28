// 后台 Service Worker：广播填充命令到标签页内所有 frame，聚合各 frame 的填充结果。

import { FillItem, FillStats } from '../core/filler';
import { ensureSeed } from '../core/storage';
import { syncRemoteRules } from '../core/rulesync';

interface Aggregation {
  tabId: number;
  frames: Record<number, FillStats>;
  items: FillItem[];
  timer: ReturnType<typeof setTimeout> | null;
  respond?: (resp: unknown) => void;
}

const pending = new Map<number, Aggregation>();

function sumStats(frames: Record<number, FillStats>): FillStats {
  const s: FillStats = { total: 0, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0 };
  for (const f of Object.values(frames)) {
    s.total += f.total;
    s.filled += f.filled;
    s.skipped += f.skipped;
    s.noMatch += f.noMatch;
    s.profileEmpty += f.profileEmpty;
    s.failed += f.failed;
    s.picker += f.picker;
  }
  return s;
}

function cancelAggregation(agg: Aggregation): void {
  if (agg.timer) clearTimeout(agg.timer);
  pending.delete(agg.tabId);
}

function startAggregation(tabId: number, respond?: (resp: unknown) => void): void {
  const prev = pending.get(tabId);
  if (prev && prev.timer) clearTimeout(prev.timer);
  const agg: Aggregation = { tabId, frames: {}, items: [], timer: null, respond };
  pending.set(tabId, agg);
  agg.timer = setTimeout(() => {
    pending.delete(tabId);
    const stats = sumStats(agg.frames);
    chrome.tabs.sendMessage(tabId, { type: 'FILL_DONE', stats, items: agg.items }, { frameId: 0 }).catch(() => {
      // 顶层 frame 无接收者（如页面刚刷新），忽略
    });
    if (agg.respond) agg.respond({ ok: true, stats });
  }, 1200);
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
        reportPending.get(tabId)!.reports.push({ frameId: sender.frameId != null ? sender.frameId : 0, ...JSON.parse(msg.report || '{}') });
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
      try {
        // 一键填充直接执行；投影摘要属于诊断信息，不再用 confirm 阻断每一次操作。
        startAggregation(tabId, sendResponse);
        await chrome.tabs.sendMessage(tabId, { type: 'FILL' });
      } catch {
        const agg = pending.get(tabId);
        if (agg) cancelAggregation(agg);
        sendResponse({ ok: false, reason: 'no-receiver' });
      }
    })();
    return true;
  }

  if (msg.type === 'FILL_RESULT') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId && pending.has(tabId)) {
      const agg = pending.get(tabId)!;
      agg.frames[sender.frameId != null ? sender.frameId : -1] = msg.stats;
      agg.items.push(...(msg.items || []));
    }
    return false;
  }

  return false;
});

import { mergeResumeResults } from '../core/fill-merge';
// 内容脚本入口：每个 frame 运行一份。顶层 frame 负责悬浮面板、自动填充与消息协调。

import { Profile } from '../core/profile';
import { loadProfile, saveProfile } from '../core/storage';
import { generateTestProfile } from '../core/testdata';
import { importFromPage } from '../core/importer';
import { addSnapshot, applicationChoicesFromPage, captureCurrentPage, commitCrawlMerge, crawlCompletionFailures, crawlDeclaredReadOnlyPages, loadCrawlSession, previewCrawlMerge, rememberApplicationChoice, saveCrawlSession } from '../core/crawl';
import { sanitizeScanForDiagnostics, scanSite } from '../core/scanner';
import { runPreSubmitCheck } from '../core/checker';
import { loadRemoteRules } from '../core/rulesync';
import { DetectedField, detectAllFields, FIELD_RULES, FieldRule, probeComponentDropdowns } from '../core/matcher';
import { clearHighlights, clearPageFill, closeLeftoverPickers, directFillRegionTriplets, fillAchievements, fillAll, fillAwardRows, fillExperiences, fillFamilyMembers, fillLanguageExams, FillItem, FillResult, FillStats, findAchievementTable, findAwardTable, findExperienceTable, findFamilyTable, findLanguageTable, getOwnedValue, getWriteRecord, languageExamEntryCount, markEl, noteExternalInput, pickInPage, readNativeControlValue, readableControlValue, sleep, snapshotFillState, trySetSelect, visibleDialogRoots } from '../core/filler';
import { ISSUE_CATALOG, issueMeta } from '../core/error-codes';
import { ADAPTERS, AUTO_SHOW_PATTERN, allAdapters, extraRulesFor, matchAdapter, PlatformAdapter } from '../core/adapters';
import type { SchoolAdapterPackage } from '../core/adapters';
import { collectAdapterPackageCandidates, matchAdapterPage, resolveAdapterPage, SCHOOL_ADAPTER_PACKAGES } from '../core/adapter-packages';
import { SCHOOLS_WITH_PROGRAMS } from '../core/school-programs';
import { projectProfile } from '../core/projection';
import { fillAdapterContract } from '../core/control-drivers';
import { fillDateControlAsync } from '../core/date-drivers';
import { runFillPipelineAsync } from '../core/fill-pipeline';
import { findNewAttributableError, stableVerifyWritten } from '../core/task-executor';
import { SettleRegistry } from '../core/settle-registry';
import { conditionalRestore } from '../core/filler';
import { bumpDocumentEpoch, bumpProfileRevision, captureRunSnapshot, documentIdentity, isRunStillActive, makeRunId, routeKeyFor } from '../core/fill-session';
import type { RunSnapshot } from '../core/fill-session';
import { toPlainFillItem } from '../core/fill-task';
import { decideRowJobRound, nextRowJobIndex, ROW_JOB_FAIL_CAP } from '../core/row-job-progress';
import { createTableEvidenceEnvelope, detectFakeSave, makeTableEvidenceScope, readScopedTableEvidence, TableEvidence } from '../core/save-guard';
import { applyFillTelemetryCounts, buildDiagnosticSummary, createFillTelemetryState, FillTelemetryEventInput, FillTelemetryStage, FillTelemetryState, reduceFillTelemetry, restoreFillTelemetryState, safeDiagnosticField, sanitizeDiagnosticValue } from '../core/fill-telemetry';
import { initPanel, PanelHandlers, renderPanelTelemetry, setPanelBusy, setPanelStatus, showPanel, showToast } from './panel';
import { startCaptchaAssistant } from './captcha-orchestrator';
import { isPickerManual, markPickerDone, markPickerFailed, markPickerManual, pickerCodeConflictDecision, pickerPairVerdict } from '../core/picker-state-machine';
import { PickerHandoffCompleteSource, PickerHandoffController } from './picker-handoff';

// ===================== 醒目填充横幅 + 进度条 =====================
let fillBanner: HTMLElement | null = null;
// 本页填充流程已收尾：后续延时轮次不再把横幅顶出来（避免完成后再弹"补填中"）
let fillFinished = false;
// 弹窗点选进行中（嵌套计数）：期间不宣告"填充完成"（东华大学等站点弹窗阶段可长达数十秒，不能提前收掉进度条）
let pickersDepth = 0;
// 弹窗点选互斥：同一字段已有点选流程在跑时，级联轮次不再重开弹窗（防"循环弹窗"）
let activePick: { key: string; at: number } | null = null;
// 行任务互斥：防止延时补填轮次与主流程并发重跑（重复点"添加"）
let rowJobsRunning = false;
let activeCrawlController: AbortController | null = null;
// 人工接管队列的页面级生命周期：新一轮填写或页面卸载时统一失效，防止旧轮询恢复错误队列。
let pickerRunGeneration = 0;
let pickerReleaseTimer: ReturnType<typeof setInterval> | null = null;
let pickerReleasePending = false;
const manuallySkippedPickerIds = new Set<string>();

/** 根据当前学校适配包，把八类原子表投影为旧填充内核可消费的临时视图。 */
function profileForCurrentPage(profile: Profile): Profile {
  const adapterPackage = resolveAdapterForFill(location.href);
  return projectProfile(profile, adapterPackage?.projectionPolicy).profile;
}

const PROGRESS_KEY = 'tui-fill-progress';
const TELEMETRY_KEY = 'tui-fill-telemetry-v1';

let telemetryState: FillTelemetryState = (() => {
  try { return restoreFillTelemetryState(sessionStorage.getItem(TELEMETRY_KEY)) || createFillTelemetryState(); }
  catch { return createFillTelemetryState(); }
})();

/** 功能：持久化脱敏运行状态，使 ASP.NET 回发或页面刷新后仍能继续展示当前任务。 */
function persistTelemetry(): void {
  try { sessionStorage.setItem(TELEMETRY_KEY, JSON.stringify(telemetryState)); } catch { /* 忽略禁用会话存储的页面 */ }
}

/** 功能：发布一条统一运行事件，并同步刷新面板与紧凑横幅的数据源。 */
function emitTelemetry(event: FillTelemetryEventInput, render = true): void {
  if (window !== window.top) return;
  telemetryState = reduceFillTelemetry(telemetryState, event);
  persistTelemetry();
  if (render) renderPanelTelemetry(telemetryState);
}

/** 功能：开始新一轮填写，清空上一轮日志和统计。 */
function beginFillTelemetry(): void {
  telemetryState = createFillTelemetryState();
  emitTelemetry({
    stage: 'identifying',
    level: 'info',
    action: '正在识别当前页面',
    reason: '正在读取适配包与可写字段',
  });
}

/** 功能：将旧进度调用映射为统一的有限状态，逐步兼容现有学校专项流程。 */
function telemetryStageFromText(stage: string): FillTelemetryStage {
  if (/弹窗|选择/.test(stage)) return 'picking';
  if (/加行|表格/.test(stage)) return 'addingRows';
  if (/纠正|补填|恢复/.test(stage)) return 'correcting';
  if (/校验|回读/.test(stage)) return 'verifying';
  if (/下一步|进入/.test(stage)) return 'navigating';
  if (/完成/.test(stage)) return 'succeeded';
  if (/人工|停止|阻断/.test(stage)) return 'blocked';
  if (/扫描|识别/.test(stage)) return 'identifying';
  return 'filling';
}

/** 落盘进度：整页回发刷新后，新文档据此恢复横幅与进度条 */
function persistProgress(pct: number, stage: string, sub: string): void {
  try {
    sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ pct, stage, sub, at: Date.now() }));
  } catch {
    // 忽略
  }
}

interface FillProgressMeta {
  telemetryStage?: FillTelemetryStage;
  targetLabel?: string;
  field?: string | null;
  current?: number;
  total?: number;
  level?: 'info' | 'success' | 'warning' | 'error';
}

/** 紧凑横幅 + 统一操作中心：优先显示真实项目数量，旧 pct 仅作为尚无明细时的阶段提示。 */
function setFillProgress(pct: number, stage: string, sub?: string, meta: FillProgressMeta = {}): void {
  if (!isTop || fillFinished) return;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const subText = sub || '';
  emitTelemetry({
    stage: meta.telemetryStage || telemetryStageFromText(stage),
    level: meta.level || (/人工|失败|异常/.test(stage + subText) ? 'warning' : 'info'),
    action: stage.replace(/^[^\p{L}\p{N}]+/u, ''),
    targetLabel: meta.targetLabel,
    field: meta.field,
    reason: subText,
    current: meta.current,
    total: meta.total,
  });
  persistProgress(p, stage, subText);
  if (!fillBanner || !fillBanner.isConnected) {
    fillBanner = document.createElement('div');
    fillBanner.className = 'tui-fill-banner';
    fillBanner.setAttribute('role', 'status');
    fillBanner.setAttribute('aria-live', 'polite');
    fillBanner.setAttribute('aria-atomic', 'true');
    fillBanner.innerHTML =
      `<div class="tui-banner-head"><span class="tui-banner-spin"></span><span class="tui-banner-title"></span><span class="tui-banner-pct"></span></div>` +
      `<div class="tui-banner-track"><div class="tui-banner-fill"></div></div>` +
      `<div class="tui-banner-sub"></div>` +
      `<div class="tui-banner-notice">⏳ 正在自动处理，请勿刷新页面、关闭选择弹窗或重复点击按钮。<br>🛡️ 插件会逐项回读并尝试纠错；密码、验证码、文件上传和最终提交始终由你操作。</div>`;
    (document.body || document.documentElement).appendChild(fillBanner);
  }
  fillBanner.classList.remove('tui-banner-done');
  const title = fillBanner.querySelector('.tui-banner-title');
  const pctEl = fillBanner.querySelector('.tui-banner-pct');
  const fillEl = fillBanner.querySelector('.tui-banner-fill') as HTMLElement | null;
  const subEl = fillBanner.querySelector('.tui-banner-sub') as HTMLElement | null;
  const hasExact = telemetryState.progress.total > 0;
  const exactPct = hasExact ? Math.round((100 * telemetryState.progress.current) / telemetryState.progress.total) : p;
  if (title) title.textContent = telemetryState.title;
  if (pctEl) pctEl.textContent = hasExact ? `${telemetryState.progress.current}/${telemetryState.progress.total}` : '处理中';
  if (fillEl) fillEl.style.width = `${exactPct}%`;
  if (subEl) subEl.textContent = telemetryState.currentLabel || telemetryState.detail || subText;
}

/** 功能：把"仍需人工"的事项用醒目 toast 顶出来（弹窗待选/选项不匹配/长文未填），不再只躺在面板日志里。 */
function announceManualWork(): void {
  const res = lastResult;
  if (!res || !isTop) return;
  const pendingPickers = res.items.filter(
    (i) => i.status === 'picker' && i.el instanceof HTMLElement && document.documentElement.contains(i.el as HTMLElement) && controlEmpty(i.el as Element),
  );
  if (pendingPickers.length) {
    const names = pendingPickers.slice(0, 2).map((i) => i.label).join('、');
    showToast(`⚠️ ${pendingPickers.length} 个弹窗选择框需要手动选择：${names}${pendingPickers.length > 2 ? ' 等' : ''}（点击字段旁「选择」按钮，详见面板日志）`, { tone: 'warn' });
  }
  if (res.stats.failed > 0) {
    showToast(`⚠️ ${res.stats.failed} 个下拉/单选未能自动选中，请手动处理（建议已写入漏填清单）`, { tone: 'warn' });
  }
  if (res.items.some((i) => i.issueCode === 'E1206')) {
    showToast('ℹ️ 长文未自动填写：页面未给出可信字数上限或档案长文超限，请人工粘贴', { tone: 'info' });
  }
}

/**
 * 完成态：100% 绿色，短暂停留后自动收起；此后本页延时轮次不再弹出横幅。弹窗点选进行中不宣告完成。
 * J00:传入 runId 时要求该轮仍是当前活跃轮——已取消/超时的旧轮不得宣告完成,也不得解锁新轮的按钮。
 */
function finishFillBanner(summary: string, sub?: string, runId?: string): void {
  if (!isTop || fillFinished || pickersDepth > 0) return;
  if (runId && (activeRunId !== runId || runLifecycleOf(runId) !== 'active')) return;
  const hint = '若资料未完全填写，请再次点击「一键填充」';
  setFillProgress(100, `✅ ${summary}`, sub ? `${sub}；${hint}` : hint);
  const partial = telemetryState.counts.failed > 0 || telemetryState.counts.waiting > 0 || telemetryState.counts.skipped > 0;
  emitTelemetry({
    stage: partial ? 'partial' : 'succeeded',
    level: partial ? 'warning' : 'success',
    action: partial ? '本轮填写已结束，仍有项目需要核对' : '本轮填写完成',
    reason: `成功 ${telemetryState.counts.filled} 项，跳过 ${telemetryState.counts.skipped} 项，失败 ${telemetryState.counts.failed} 项，待处理 ${telemetryState.counts.waiting} 项`,
    current: telemetryState.counts.completed,
    total: telemetryState.counts.total,
  });
  fillFinished = true;
  setPanelBusy(false); // 本轮结束：主操作按钮立即可用（再次填写/清除已填）
  announceManualWork();
  try {
    sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    // 忽略
  }
  if (fillBanner) {
    fillBanner.classList.add('tui-banner-done');
    const notice = fillBanner.querySelector('.tui-banner-notice');
    if (notice) notice.textContent = '✅ 本轮自动填写已经结束。请核对绿色项目以及红色、黄色提醒；确认无误后再手动保存或最终提交。';
    const el = fillBanner;
    setTimeout(() => {
      if (fillBanner === el) {
        el.remove();
        fillBanner = null;
      }
    }, 4500);
  }
}

/** 页面刷新后恢复横幅：有进行中的行任务或本页曾一键填充过则续显（整页回发刷新后进度条不中断） */
function restoreProgressBanner(): void {
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as { pct?: number; stage?: string; sub?: string };
    if (typeof s.pct === 'number' && s.pct > 0 && s.pct < 100) {
      setFillProgress(s.pct, s.stage || '🔄 自动填写继续中…', s.sub || '');
    }
  } catch {
    // 忽略
  }
}

const isTop = window === window.top;

/** 功能:F01 生产包解析:同等级多包歧义时不静默取首(返回 undefined 走通用链)。 */
function resolveAdapterForFill(url: string): SchoolAdapterPackage | undefined {
  const res = collectAdapterPackageCandidates(url, adapterPackages);
  return res.ambiguous ? undefined : res.winner?.pkg;
}

// ===== P05:轮次/文档作用域状态 =====
let activeRunId: string | undefined;
let activeRunSnapshot: ReturnType<typeof captureRunSnapshot> | null = null;
/**
 * J00:每轮显式生命周期——原轮校验不能只看 runId/URL/档案修订。
 * active=仍在执行;cancelled=被用户取消/换档案/新轮替换;expired=后台 deadline 或页面导航。
 * 一旦非 active,该轮所有排队回调、Promise 恢复点与副作用全部失效(已写入的值保留,不自动撤销用户数据)。
 */
type RunLifecycle = 'active' | 'cancelled' | 'expired';
const runLifecycles = new Map<string, RunLifecycle>();
const RUN_LIFECYCLE_MAX = 16;
function runLifecycleOf(runId: string | undefined): RunLifecycle {
  if (!runId) return 'active';
  return runLifecycles.get(runId) || 'active';
}
/** 功能:登记某轮的非活跃状态(有界保留,便于迟到的 Promise 仍能查到自己的状态)。 */
function markRunLifecycle(runId: string, state: RunLifecycle): void {
  if (!runId) return;
  runLifecycles.set(runId, state);
  while (runLifecycles.size > RUN_LIFECYCLE_MAX) {
    const oldest = runLifecycles.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    runLifecycles.delete(oldest);
  }
}
// F06:本 FILL 轮 settle 验证上下文(原轮 items/stats);FILL_DONE 收口做确定性复验,防后台页定时器节流造成计数失真。
// H04:多补填阶段的 pending 验证必须并存——只保留最新一轮会让较早轮次的写入失去验证(假 filled)。
const settleRegistry = new SettleRegistry<FillItem>();
// F06:当前页契约声明的校验错误容器与写前基线(用于"只归因新增且与目标关联的错误")。
let activeValidationSelectors: string[] = [];
let activeValidationBaseline: string[] = [];

/** 功能:记录写前校验错误容器文本基线(仅页面级容器,不含用户数据)。 */
function captureValidationBaseline(doc: Document, selectors: string[]): void {
  activeValidationBaseline = [];
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel);
      activeValidationBaseline.push(el ? (el.textContent || '').trim() : '');
    } catch {
      activeValidationBaseline.push('');
    }
  }
}


/** 功能:F06 settle 复验执行体——把"当前值偏离本轮写入快照"的 filled 标量目标转 failed(不重写)。 */
function runSettleOnce(items: FillItem[], stats: FillStats, ctx: RunSnapshot | null = null): number {
  let changed = 0;
  try {
    for (const item of items) {
      if (item.status !== 'filled' || !item.el) continue;
      const el = item.el;
      const fail = (reason: string, allowRestore = false): void => {
        item.status = 'failed';
        // G06:可归因失败(值仍为自动写值且所有权完整)时按驱动策略恢复到写前值。
        if (allowRestore) {
          const verdict = conditionalRestore(document, el, ctx);
          if (verdict === 'restored') item.reason = `${reason};已按驱动策略恢复写前原值`;
          else if (verdict === 'restoreFailed') item.reason = `${reason};恢复写前原值失败,请人工核对`;
          else item.reason = `${reason};未自动恢复(来源不确定或驱动不可逆)`;
        } else {
          item.reason = reason;
        }
        markEl(el, 'missing');
        changed += 1;
      };
      // G03:节点离开文档/被替换 → 失效,不得悄悄保留 filled。
      if (!document.contains(el)) {
        fail('验证时节点已离开文档(可能被页面重建),结果不可信');
        continue;
      }
      const record = getWriteRecord(document, el);
      const expected = item.expectedValue ?? record?.expected;
      // G03:无期望值且无写入记录 → 无法验证,不得报告成功。
      if (expected === undefined) {
        fail('缺少写入记录或期望值,无法完成稳定验证');
        continue;
      }
      const current = readNativeControlValue(el);
      // 值维度:真实 DOM 值必须等于本轮期望值。
      if (current !== expected) {
        fail('写入后未稳定接受:页面在 settle 窗口内改写或清空了该值');
        continue;
      }
      // G03:validation 与值比较是两个独立维度——值正确但本字段新增关联错误仍不可成功。
      if (activeValidationSelectors.length) {
        const attr = findNewAttributableError(document, el, activeValidationSelectors, activeValidationBaseline);
        if (attr) {
          fail(`值已写入但页面报本字段错误:${attr.text}`, true);
          continue;
        }
      }
    }
  } catch {
    // G03:验证异常不得保留成功状态——本轮已判定的失败保留,未判定的目标转 failed 由调用方统计。
  }
  if (changed > 0) {
    stats.filled = Math.max(0, stats.filled - changed);
    stats.failed += changed;
  }
  return changed;
}

/** 功能:F06 逐写 settle 验证(每轮写入都注册,各自独立收口)。
 * 说明:补填轮次(2.5/7/15s)写入的字段若被框架重置,必须由该轮自己的 settle 收口,否则会残留 filled 假阳性。
 * H04:同一轮内多个补填阶段的 pending 验证并存,不得被后续注册覆盖丢弃。 */
function scheduleSettleChecks(items: FillItem[], stats: FillStats | undefined, ctx: RunSnapshot | null = null): void {
  if (!stats) return;
  const run = settleRegistry.register(ctx?.runId || activeRunId || '', items, stats, ctx);
  setTimeout(() => {
    if (!settleRegistry.take(run)) return; // 已被收口处理:不得重复计数
    if (!runStillActive(run.ctx)) return;
    run.failed += runSettleOnce(run.items, run.stats as FillStats, run.ctx);
    if (isTop && run.failed > 0) {
      fillFinished = true;
      recordFillResultTelemetry(run.items, run.stats as FillStats);
      setPanelStatus(formatStats(run.stats as FillStats));
    }
  }, 420);
}

/** 功能:读取并递增本 frame 的回报序号(同 frame 新结果覆盖旧序号,后台不再叠加)。 */
function nextFrameSeq(): number {
  try {
    const raw = Number(sessionStorage.getItem('tui-frame-seq') || '0');
    const next = (Number.isFinite(raw) ? raw : 0) + 1;
    sessionStorage.setItem('tui-frame-seq', String(next));
    return next;
  } catch {
    return Date.now();
  }
}

/**
 * 功能:G04 异步恢复守卫——只接受"排队时捕获的原轮快照",禁止读取当前全局轮次。
 * 判定:① 该轮生命周期仍为 active(J00:取消/超时后即使 runId 未变也失效);
 * ② 当前活跃轮仍是该原轮(否则已被新轮取代);③ 该原轮快照仍有效(同文档/同路由/同档案修订)。
 */
function runStillActive(ctx: RunSnapshot | null | undefined): boolean {
  if (!ctx) return false;
  if (runLifecycleOf(ctx.runId) !== 'active') return false; // J00:显式生命周期
  if (!isRunStillActive(ctx, activeRunSnapshot, document, location.href)) return false;
  // G04:适配包版本变化 → 旧轮失效(合同语义可能已变)。
  const pkg = resolveAdapterForFill(location.href);
  if ((ctx?.packageVersion || '') !== (pkg?.version || '')) return false;
  return true;
}

/**
 * 功能:J00 使某轮立即失效并停止后续副作用(不自动撤销已写入的值)。
 * 步骤:标记生命周期 → 清理该轮 pending 登记(settle/异步工作/级联/终态定时器)→ 上报 cancelled。
 * 说明:上报是"该轮已取消"的明确终态,避免后台等满 deadline 后误报"页面无响应"。
 */
function deactivateRun(runId: string | undefined, state: 'cancelled' | 'expired', reason: string): void {
  if (!runId) return;
  if (runLifecycleOf(runId) !== 'active') return; // 幂等:已失效不重复处理
  markRunLifecycle(runId, state);
  settleRegistry.dropRun(runId);
  pendingAsyncWork.delete(runId);
  if (activeRunId === runId) {
    if (terminalTimer) { clearTimeout(terminalTimer); terminalTimer = null; }
    if (manualResumeTimer) { clearTimeout(manualResumeTimer); manualResumeTimer = null; }
    manualResumeRelease?.(); manualResumeRelease = null;
    if (manuallyPausedRunId === runId) manuallyPausedRunId = '';
    cascadeWatch = [];
  }
  // J00.5:取消/超时各有准确提示(已填内容保留,不自动撤销用户数据)。
  if (isTop && activeRunId === runId) {
    const label = state === 'cancelled' ? '本轮填写已取消' : '本轮填写已超时停止';
    const detail = state === 'cancelled'
      ? (reason === 'profile-changed' ? '档案已变更,旧轮已停止;已填内容保留' : reason.startsWith('resume-') || reason.startsWith('pause-') ? '后台未确认人工续填，已停止自动操作;已填内容保留' : '本轮已被新的填写取代;已填内容保留')
      : '后台等待超时,已停止本轮;已填内容保留';
    setPanelStatus(`⚠️ ${label}:${detail}`);
    finishFillBanner(label, detail);
  }
  // J00.6:已完成字段保留在报告里(不丢结果让 total 变 0 假装收口);未完成字段由 terminalKind 表达。
  const sameRun = lastResult && lastResultRunId === runId;
  try {
    void chrome.runtime.sendMessage({
      type: 'FILL_TERMINAL',
      runId,
      docId: documentIdentity(document),
      frameSeq: nextFrameSeq(),
      stats: sameRun ? lastResult!.stats : { total: 0, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 },
      items: sameRun ? lastResult!.items.map((item) => toPlainFillItem(item)) : [],
      terminalKind: 'cancelled',
      cancelReason: reason,
    });
  } catch {
    // 后台不存在时忽略
  }
}

/** 功能:J00 取消当前活跃轮(换档案/新轮替换/用户取消共用)。 */
function cancelActiveRun(reason: string): void {
  const runId = activeRunId;
  if (!runId) return;
  deactivateRun(runId, 'cancelled', reason);
}

// 文档代际:整页回发/导航后 epoch+1(会话存储跨刷新保留),使旧异步任务自然失效。
window.addEventListener('pagehide', () => bumpDocumentEpoch(document));
// G02:用户/页面干预监听——扩展写入期间的事件不计;其余 input/change 视为用户编辑,
// 使该控件的可清除所有权失效(值即使后来改回相同也不恢复权限)。
document.addEventListener('input', (e) => noteExternalInput(e.target as Element), true);
document.addEventListener('change', (e) => noteExternalInput(e.target as Element), true);

// 档案/规则变更:profile 修订+1,运行中任务在下一个恢复点失效(不立即打断正在进行的写入)。
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes.profile) {
      bumpProfileRevision(document);
      // J00:档案变更必须让正在等待的日期/依赖/picker/行任务及时停止并上报 cancelled,
      // 而不是靠各自恢复点慢慢发现、最后被后台误报 25 秒超时。
      cancelActiveRun('profile-changed');
    }
  });
}

const pickerHandoffController = isTop ? new PickerHandoffController(document) : null;
let adapters: PlatformAdapter[] = ADAPTERS;
let adapterPackages = SCHOOL_ADAPTER_PACKAGES;
let activeRules: FieldRule[] = [...FIELD_RULES, ...extraRulesFor(location.href)];

/**
 * 功能：使用既有专项契约与完整字段驱动填写当前文档。
 *
 * 用户主动填写时重置 picker 尝试；延时补填保留本轮人工跳过状态，
 * 使人工接管闭环不会被后台重试重新打开同一弹窗。
 */
async function fillCurrentDocument(profile: Profile, resetPickerAttempts = false, resetValidationBaseline = false, ctx: RunSnapshot | null = activeRunSnapshot): Promise<FillResult> {
  const adapterPackage = resolveAdapterForFill(location.href);
  // F06:缓存本页契约的校验错误容器;基线只在用户点击/明确恢复启动时捕获一次,
  // 补填轮次不重捕——否则末轮会把"已存在的本字段错误"当成基线,漏判失败(G06)。
  try {
    const pageRes = adapterPackage ? resolveAdapterPage(adapterPackage, document, location.href) : null;
    activeValidationSelectors = pageRes?.winner?.page.validationErrorSelectors || [];
    if (resetValidationBaseline || activeValidationBaseline.length === 0) {
      captureValidationBaseline(document, activeValidationSelectors);
    }
  } catch {
    activeValidationSelectors = [];
    activeValidationBaseline = [];
  }
  // v5(G00):整链编排走唯一生产入口 runFillPipeline(合同→认领→通用→合并)。
  // H02:显式传入本轮 ctx——写入记录与失败恢复都绑定该轮(档案修订/导航后旧记录不得恢复)。
  const release = trackAsyncWork(ctx);
  try {
    return (await runFillPipelineAsync(profile, document, location.href, { rules: activeRules, resetPickerAttempts, adapterPackage, validationBaseline: activeValidationBaseline, run: ctx ?? undefined, stillActive: () => runStillActive(ctx) })).result;
  } finally { release(); }
}
let lastResult: FillResult | null = null;
// J00:记录 lastResult 属于哪一轮,取消上报时只能引用本轮结果(不得把新轮结果当成旧轮的)。
let lastResultRunId = '';

/** 功能：把普通字段填充结果批量写入实时日志；不写 valuePreview，避免泄露档案真实值。 */
function recordFillResultTelemetry(items: FillItem[], stats: FillStats): void {
  if (!isTop) return;
  const statusText: Record<FillItem['status'], { level: 'info' | 'success' | 'warning' | 'error'; action: string }> = {
    filled: { level: 'success', action: '已填写并回读通过' },
    alreadyCorrect: { level: 'success', action: '页面已有相同值,已跳过写入' },
    conflict: { level: 'warning', action: '页面已有不同值,已保留原值' },
    picker: { level: 'info', action: '等待弹窗精确选择' },
    profileEmpty: { level: 'warning', action: '档案没有可用数据' },
    noMatch: { level: 'warning', action: '未匹配到安全填写规则' },
    skipped: { level: 'warning', action: '已按安全规则跳过' },
    failed: { level: 'error', action: '写入或回读失败' },
  };
  for (const item of items.slice(0, 100)) {
    const display = statusText[item.status];
    telemetryState = reduceFillTelemetry(telemetryState, {
      // 本轮已宣告完成后保留终态阶段：迟到的条目日志（补填轮次/子框架回报）不得把面板翻回"进行中"卡死按钮
      stage: fillFinished ? telemetryState.stage : item.status === 'picker' ? 'picking' : 'filling',
      level: display.level,
      action: display.action,
      targetLabel: item.label,
      field: item.field,
      reason: item.reason,
    });
  }
  let alreadyCorrectCount = 0;
  let conflictCount = 0;
  for (const item of items) {
    if (item.status === 'alreadyCorrect') alreadyCorrectCount += 1;
    else if (item.status === 'conflict') conflictCount += 1;
  }
  telemetryState = applyFillTelemetryCounts(telemetryState, {
    total: stats.total,
    filled: stats.filled,
    skipped: stats.skipped + stats.noMatch,
    failed: stats.failed,
    waiting: stats.profileEmpty + stats.picker + conflictCount,
    alreadyCorrect: alreadyCorrectCount,
    conflict: conflictCount,
  });
  persistTelemetry();
  renderPanelTelemetry(telemetryState);
}

// 远程规则（默认关闭，需用户在设置中授权）：异步合并，合并后刷新规则集
void loadRemoteRules().then((remote) => {
  if (!remote) return;
  adapters = allAdapters(remote);
  adapterPackages = remote?.packages?.length ? [...SCHOOL_ADAPTER_PACKAGES, ...remote.packages] : SCHOOL_ADAPTER_PACKAGES;
  activeRules = [...FIELD_RULES, ...extraRulesFor(location.href, adapters), ...(remote.extraFieldRules || [])];
});

function detect(): DetectedField[] {
  return detectAllFields(document, activeRules);
}

function formatStats(s: FillStats): string {
  const manual = s.failed + s.picker;
  let t = `识别 ${s.total} 个字段：已填充 ${s.filled}；跳过 ${s.skipped}（验证码/密码）；档案未填 ${s.profileEmpty}；未匹配 ${s.noMatch}；需人工 ${manual}`;
  if (s.picker > 0) t += `（其中弹窗选择框 ${s.picker}）`;
  if (manual > 0) t += '；请人工核对红色高亮项';
  return t;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function buildMissingText(res: FillResult, profile: Profile): string {
  const failed = res.items.filter((i) => i.status === 'failed');
  const picker = res.items.filter((i) => i.status === 'picker');
  const empty = res.items.filter((i) => i.status === 'profileEmpty');
  const lines: string[] = [];
  if (failed.length) {
    lines.push('【页面有选项但未能自动选中，请人工选择】[E1103]');
    failed.forEach((i) => lines.push(`${i.label}：${i.valuePreview || ''}`));
    lines.push(`处理建议：${issueMeta('E1103')?.action || ''}`);
  }
  if (picker.length) {
    lines.push('');
    lines.push('【弹窗选择框：点字段旁的「选择」按钮打开选择器，选取以下目标】[E1203]');
    picker.forEach((i) => lines.push(`${i.label}：${i.valuePreview || ''}`));
    lines.push(`处理建议：${issueMeta('E1203')?.action || ''}`);
  }
  if (empty.length) {
    lines.push('');
    lines.push('【档案中尚未填写，可在「档案编辑器」中补充】[E1102]');
    empty.forEach((i) => {
      const hint = i.field && i.field.startsWith('compose.') ? '请在档案中补充对应经历列表' : `档案字段：${i.field}`;
      lines.push(`${i.label}（${hint}）`);
    });
  }
  const manual = res.items.filter((i) => i.status === 'skipped' && i.issueCode === 'E1206');
  if (manual.length) {
    lines.push('');
    lines.push('【长文未自动填写】[E1206]');
    manual.forEach((i) => lines.push(`${i.label}：${i.reason || ''}`));
  }
  const statements = profile.essays.length ? profile.essays.map((essay) => ({ title: `${essay.kind}${essay.charLimit ? `（上限 ${essay.charLimit} 字）` : ''}`, content: essay.content })) : profile.selfStatements;
  if (statements.length) {
    lines.push('');
    lines.push('【自我陈述版本速查】');
    statements.forEach((s) => lines.push(`${s.title}：${s.content ? s.content.length : 0} 字`));
  }
  return lines.join('\n') || '没有漏填项 🎉';
}

/** 不包含任何填写值，仅结构与匹配结果，用于反馈给开发者改进规则。 */
/**
 * 功能:I02 定义的"用户导出(含资料)"路径——漏填清单由用户主动点击复制,内容是本页需要人工处理的字段与目标值。
 * 边界:只在内存中生成、直接进剪贴板(用户自己可见可删除);不写 sessionStorage、不发跨上下文消息。
 * 与之相对,"复制字段报告"是无资料诊断(固定字段类别+状态+问题码)。
 */
function buildReport(): string {
  const fields = detect();
  const safeUrl = routeKeyFor(location.href);
  const fillSummary = (() => {
    try {
      const raw = sessionStorage.getItem('tui-fill-summary');
      // I02:普通诊断只走"无资料摘要"——固定字段类别 + 状态 + 问题码,不含页面标签/资料值/页面错误原文。
      return buildDiagnosticSummary(raw ? JSON.parse(raw) : null);
    } catch { return null; }
  })();
  const siteStructure = sanitizeScanForDiagnostics(scanSite(document)); // I02:只含结构签名
  siteStructure.url = safeUrl;
    return JSON.stringify(
      {
        url: safeUrl,
        title: '报名页面',
        adapter: matchAdapter(location.href, adapters) ? matchAdapter(location.href, adapters)!.id : null,
        adapterPackage: resolveAdapterForFill(location.href)?.id || null,
        // 稳定问题码目录：报告中 items.issue 可直接对照"用户该做什么"
        issueCatalog: ISSUE_CATALOG,
        // 只保留状态和字段名，不包含档案值、姓名、证件、电话、邮箱或真实表格内容。
        fillSummary,
      // 弹窗点选调试记录（trigger 命中/点击策略/是否弹出/最终结果）
      pickDebug: (() => {
        try {
          const raw = sessionStorage.getItem('tui-pick-debug');
          return raw ? sanitizeDiagnosticValue(JSON.parse(raw)) : null;
        } catch {
          return null;
        }
      })(),
      // 行任务（自动加行）逐轮诊断：类型/进度/行数变化/异常
      rowJobsDebug: (() => {
        try {
          const raw = sessionStorage.getItem('tui-rowjobs-debug');
          return raw ? sanitizeDiagnosticValue(JSON.parse(raw)) : null;
        } catch {
          return null;
        }
      })(),
      // 动作按钮点击诊断：被点元素签名（tag/id/class/disabled/onclick）+ 触发策略（"点了没反应"类问题定位用）
      clickDebug: (() => {
        try {
          const raw = sessionStorage.getItem('tui-click-debug');
          return raw ? sanitizeDiagnosticValue(JSON.parse(raw)) : null;
        } catch {
          return null;
        }
      })(),
      // 加行按钮查找诊断：被跳过的候选及原因（disabled/other-table/own-ui）——定位"为什么没点到真按钮"
      addbtnDebug: (() => {
        try {
          const raw = sessionStorage.getItem('tui-addbtn-debug');
          return raw ? sanitizeDiagnosticValue(JSON.parse(raw)) : null;
        } catch {
          return null;
        }
      })(),
      // 主世界回发函数探测（WebForm_DoPostback 是否存在及其形态；数组 = 每次点击的方式/目标/函数源码片段）
      wfpProbe: (() => {
        try {
          const raw = sessionStorage.getItem('tui-wfp-probe');
          if (!raw) return null;
          try {
            return sanitizeDiagnosticValue(JSON.parse(raw));
          } catch {
            return sanitizeDiagnosticValue(raw);
          }
        } catch {
          return null;
        }
      })(),
      // 最近一次整页回发/跳转时间戳（判断「添加」点击是否真的触发了页面刷新）
      pbFired: (() => {
        try {
          return sessionStorage.getItem('tui-pb-fired') || null;
        } catch {
          return null;
        }
      })(),
      // 站点架构扫描：网格表格列头/数据行 HTML 样例/加行按钮/弹窗触发器（"先读架构再操作"）
      siteScan: siteStructure,
      // 组件下拉脱敏探针：只含 DOM 结构属性，不含任何控件值或档案数据。
      widgetProbe: sanitizeDiagnosticValue(probeComponentDropdowns(document)),
      total: fields.length,
      // I02:只保留结构信息(标签/选项文本可能是页面资料原文,一律不进入报告)。
      fields: fields.map((f) => ({
        tag: f.el.tagName.toLowerCase(),
        type: f.el.tagName === 'INPUT' ? (f.el as HTMLInputElement).type : '',
        name: sanitizeDiagnosticValue(f.el.getAttribute('name') || ''),
        id: sanitizeDiagnosticValue(f.el.id || ''),
        readonly: f.readonly,
        hasPickerTrigger: !!f.pickerTrigger,
        matched: f.skip ? 'SKIP' : f.rule ? safeDiagnosticField(f.rule.field) : 'NO_MATCH',
        optionCount: f.el.tagName === 'SELECT' ? (f.el as HTMLSelectElement).options.length : 0,
      })),
      tables: Array.from(document.querySelectorAll('table'))
        .slice(0, 20)
        .map((t) => {
          return {
            rows: t.rows.length,
            hasThead: !!t.querySelector('thead'),
            hasTbody: !!t.querySelector('tbody'),
            inputCount: t.querySelectorAll('input, select, textarea').length,
            headerCells: Array.from(t.rows[0] ? t.rows[0].cells : []).map((c) => `cell:${c.tagName.toLowerCase()}:${(c.textContent || '').trim().length}`), // I02:只给结构签名,不给表头原文
            dataRows: [],
          };
        }),
      buttons: Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], input[type="image"], span, i, div[role="button"]'))
        .slice(0, 80)
        .map((b) => ({
          tag: b.tagName.toLowerCase(),
          text: sanitizeDiagnosticValue(b.textContent || ''),
          value: sanitizeDiagnosticValue(b.getAttribute('value') || ''),
          alt: sanitizeDiagnosticValue(b.getAttribute('alt') || ''),
          cls: sanitizeDiagnosticValue(b.getAttribute('class') || ''),
          name: sanitizeDiagnosticValue(b.getAttribute('name') || ''),
          hrefKind: /^javascript:/i.test(b.getAttribute('href') || '') ? 'javascript' : b.hasAttribute('href') ? 'link' : '',
          disabled: !!(b as HTMLButtonElement).disabled,
          hasOnclick: b.hasAttribute('onclick'),
        })),
    },
    null,
    2,
  );
}

// ===================== 弹窗选择框自动点选与联动重试 =====================

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** 控件是否"空"（未选/未填）——不能复用 fieldValueOf（其对输入框返回 "值|checked"，空框也会返回 "|false" 导致误判"已选过"） */
function controlEmpty(el: Element): boolean {
  // 组件下拉（jqx 等无原生值控件）：选择成功后由点选内核打上 data-tui-value 标记
  if (el.getAttribute('data-tui-value')) return false;
  const tag = el.tagName;
  if (tag === 'SELECT') return (el as HTMLSelectElement).value === '';
  if (tag === 'TEXTAREA') return (el as HTMLTextAreaElement).value.trim() === '';
  const i = el as HTMLInputElement;
  return i.value.trim() === '' && !i.checked;
}

function hasDeferredFillWork(): boolean {
  if (pickersDepth > 0 || activePick || pickerReleasePending || pickerHandoffController?.hasActiveTask() || rowJobsRunning || readRowJobs().length) return true;
  const pendingPicker = Array.from(document.querySelectorAll<HTMLElement>('[data-tui-picker-profile]')).some((el) => controlEmpty(el));
  if (pendingPicker) return true;
  return Array.from(document.querySelectorAll<HTMLSelectElement>('select')).some((el) => {
    const value = el.value;
    return !value && el.options.length <= 1 && !el.disabled;
  });
}

/** 功能:H03 终态类别——等待人工接管的轮次显式声明,不得与普通完成混同。 */
function terminalKindForFrame(): 'done' | 'waiting-manual' {
  if (activePick || pickerReleasePending || pickerHandoffController?.hasActiveTask() || pickersDepth > 0) return 'waiting-manual';
  if ((lastResult?.stats.picker ?? 0) > 0 || (lastResult?.stats.failed ?? 0) > 0 && hasDeferredFillWork()) return 'waiting-manual';
  return 'done';
}

/**
 * 功能:I00 本帧是否仍有未完成工作(settle 待验证 + 依赖/picker/行任务/日期组件/补填)。
 * 说明:终态必须等它归零后才发送;不得再用固定时长("15s+470ms")代替工作集合。
 * 补充:填充时发现的"级联下拉"(当时无选项)必须等到真正被填上或超界,不能一拿到选项就当作工作结束。
 */
function frameWorkPending(): boolean {
  if (settleRegistry.hasRun(activeRunId || '') || (pendingAsyncWork.get(activeRunId || '') || 0) > 0) return true;
  if (cascadeWatch.some((el) => el.isConnected && !(el as HTMLSelectElement).value && !(el as HTMLSelectElement).disabled)) return true;
  return hasDeferredFillWork();
}

// I00:每轮只发一次终态;等待工作集合归零有界(250ms × 40 = 10s),超界按未完成类别如实上报。
let terminalTimer: ReturnType<typeof setTimeout> | null = null;
let sendTerminalNow: (() => void) | null = null;
let terminalSentRunId = '';
/** J01:人工完成后的续轮定时器(只保留一个)。 */
let manualResumeTimer: ReturnType<typeof setTimeout> | null = null;
let manualResumeRelease: (() => void) | null = null;
let manuallyPausedRunId = '';
/** I00:填充时发现的无选项空下拉(级联件);选项出现后仍须被真正填上才算工作结束。 */
let cascadeWatch: HTMLElement[] = [];
const pendingAsyncWork = new Map<string, number>();

/** 功能：记录实际异步填写/日期操作；释放放到下一任务再检查终态，让调用方先登记回读结果。 */
function trackAsyncWork(ctx: RunSnapshot | null): () => void {
  const runId = ctx?.runId;
  if (!runId) return () => undefined;
  pendingAsyncWork.set(runId, (pendingAsyncWork.get(runId) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (pendingAsyncWork.get(runId) || 1) - 1;
    if (remaining > 0) pendingAsyncWork.set(runId, remaining);
    else pendingAsyncWork.delete(runId);
    setTimeout(() => { if (runStillActive(ctx)) scheduleTerminalWhenIdle(runId); }, 0);
  };
}
function scheduleTerminalWhenIdle(runId: string, attempt = 0): void {
  if (activeRunId !== runId || terminalSentRunId === runId || !sendTerminalNow) return;
  if (terminalTimer) {
    clearTimeout(terminalTimer);
    terminalTimer = null;
  }
  // 明确的人工接管不是仍在运行的自动任务；保留 waiting-manual，而非等到后台误报超时。
  const manualOnly = !!pickerHandoffController?.hasActiveTask() && pickersDepth === 0 && !rowJobsRunning && readRowJobs().length === 0
    && !settleRegistry.hasRun(runId) && (pendingAsyncWork.get(runId) || 0) === 0
    && !cascadeWatch.some((el) => el.isConnected && !(el as HTMLSelectElement).value && !(el as HTMLSelectElement).disabled);
  if (manualOnly) { sendTerminalNow(); return; }
  if (frameWorkPending()) {
    // 轮询上限不是成功条件：仍有工作就停止本次轮询，由后续完成事件唤醒或后台deadline报告超时。
    if (attempt < 40) terminalTimer = setTimeout(() => scheduleTerminalWhenIdle(runId, attempt + 1), 250);
    return;
  }
  sendTerminalNow();
}
function markTerminalSent(runId: string): boolean {
  if (terminalSentRunId === runId) return false;
  terminalSentRunId = runId;
  return true;
}

/** 联动下拉自动重试：目标选项一旦出现立即填充；仅在仍有未完成项时保留兜底轮次。 */
function scheduleCascadeRetries(items: FillItem[], stats?: FillStats, ctx: RunSnapshot | null = null): void {
  if (!isTop) return;
  const retrySelects = () => {
    let pending = false;
    for (const it of items) {
      if (it.status !== 'failed') continue;
      const el = it.el as HTMLSelectElement | undefined;
      if (!el || el.tagName !== 'SELECT' || !document.documentElement.contains(el)) continue;
      if (it.valuePreview && trySetSelect(el, it.valuePreview)) {
        it.status = 'filled';
        markEl(el, 'filled');
      } else {
        pending = true;
      }
    }
    return pending;
  };
  const pendingNow = retrySelects();
  // 选项尚未异步加载时才安排重试；选项已出现则不再空等三轮。
  if (pendingNow) [450, 1200, 2400].forEach((delay) => setTimeout(() => { if (runStillActive(ctx)) retrySelects(); }, delay));
  // 日期组件在 blur 后可能异步重置；用独立日期内核做第二阶段面板交互和完整回读。
  const dateItems = items.filter((it) => /^(basic\.birthday|education\.(startDate|endDate))$/.test(it.field || '') && it.valuePreview);
  if (dateItems.length) setTimeout(() => {
    if (!runStillActive(ctx)) return;
    for (const it of dateItems) {
      const input = it.el as HTMLInputElement | undefined;
      if (!input || input.tagName !== 'INPUT' || !document.documentElement.contains(input) || !it.valuePreview) continue;
      const readList = (name: string): string[] => {
        try {
          const parsed = JSON.parse(input.getAttribute(name) || '[]');
          return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string') ? parsed : [];
        } catch { return []; }
      };
      const precision = input.getAttribute('data-tui-date-precision');
      const format = input.getAttribute('data-tui-date-format');
      const releaseDate = trackAsyncWork(ctx);
      void fillDateControlAsync(input, it.valuePreview, {
        precision: precision === 'year' || precision === 'month' || precision === 'day' ? precision : undefined,
        format: format === 'yyyy' || format === 'yyyyMM' || format === 'yyyy-MM' || format === 'yyyy/MM' || format === 'yyyy年MM月' || format === 'yyyyMMdd' || format === 'yyyy-MM-dd' || format === 'yyyy/MM/dd' || format === 'yyyy年MM月dd日' ? format : undefined,
        hiddenValueSelectors: readList('data-tui-date-model-selectors'),
        panelSelectors: readList('data-tui-date-panel-selectors'),
      }, () => !runStillActive(ctx)).then((result) => {
        if (!runStillActive(ctx) || !input.isConnected) return;
        const before = it.status;
        it.status = result.ok ? 'filled' : 'failed';
        it.reason = result.reason;
        if (result.ok) it.expectedValue = result.written;
        if (stats && before !== it.status) {
          if (before === 'filled') stats.filled = Math.max(0, stats.filled - 1);
          if (before === 'failed') stats.failed = Math.max(0, stats.failed - 1);
          if (it.status === 'filled') stats.filled += 1;
          else stats.failed += 1;
        }
        markEl(input, result.ok ? 'filled' : 'missing');
        scheduleSettleChecks(items, stats, ctx);
      }).finally(releaseDate);
    }
  }, 350);
  // 弹窗驱动本身带有 iframe/结果回读等待；先快速尝试，未完成时再保留 1200ms 兜底，减少稳定页面空等。
  setTimeout(() => { if (runStillActive(ctx)) void attemptPickers(items, stats, ctx); }, 80);
}

/** 功能：为 picker 构造稳定字段标识；无 profile path 时退化到控件名/id/标签。 */
function pickerFieldId(item: FillItem, el: HTMLElement): string {
  return item.pickerContext?.profilePath || item.field || (el as HTMLInputElement).name || el.id || item.label;
}

/** 功能：停止“跳过后等待弹窗释放”的唯一轮询，防止跨轮次残留回调。 */
function clearPickerReleaseWait(): void {
  if (pickerReleaseTimer) clearInterval(pickerReleaseTimer);
  pickerReleaseTimer = null;
  pickerReleasePending = false;
}

/**
 * 功能：开始新的 picker 运行代次，并清理上一轮接管 UI、轮询和本轮跳过集合。
 * 仅用户主动点击一键填充时调用；自动补填不得清除此集合。
 */
function beginPickerRun(): void {
  pickerRunGeneration++;
  clearPickerReleaseWait();
  pickerHandoffController?.destroy();
  manuallySkippedPickerIds.clear();
}

/** 功能：销毁当前 picker 接管生命周期；页面卸载或用户清理时调用，不恢复任何旧队列。 */
function destroyPickerRun(): void {
  pickerRunGeneration++;
  clearPickerReleaseWait();
  pickerHandoffController?.destroy();
}

/**
 * 功能：字段已完成后等待原弹窗真正释放，再启动下一 picker。
 * 即使目标字段先于弹窗关闭完成回填，也不会把下一字段的输入发送到旧弹窗。
 */
function resumePickerQueueWhenSafe(
  items: FillItem[],
  stats: FillStats | undefined,
  roots: HTMLElement[],
  generation: number,
  ctx: RunSnapshot | null = null,
): void {
  clearPickerReleaseWait();
  const resume = (): void => {
    clearPickerReleaseWait();
    if (generation === pickerRunGeneration) void attemptPickers(items, stats, ctx);
  };
  const stillOpen = (): boolean => {
    const visibleNow = new Set(visibleDialogRoots(document));
    return roots.length ? roots.some((root) => root.isConnected && visibleNow.has(root)) : false;
  };
  if (!stillOpen()) {
    setTimeout(resume, 0);
    return;
  }
  pickerReleasePending = true;
  pickerReleaseTimer = setInterval(() => {
    if (generation !== pickerRunGeneration) {
      clearPickerReleaseWait();
      return;
    }
    if (!stillOpen()) resume();
  }, 600);
}

/**
 * 功能：把人工回填收敛为单次成功事件，并恢复同一轮剩余 picker 队列。
 * 触发条件：按钮确认或轮询确认控件非空；退出条件：代次过期、元素断连或该项已经完成。
 */
function completeManualPicker(
  item: FillItem,
  el: HTMLElement,
  items: FillItem[],
  stats: FillStats | undefined,
  roots: HTMLElement[],
  generation: number,
  source: PickerHandoffCompleteSource,
  ctx: RunSnapshot | null = null,
): void {
  if (!runStillActive(ctx)) return; // G04:旧轮/导航后的人工接管回调不再恢复队列
  if (generation !== pickerRunGeneration || !el.isConnected || controlEmpty(el) || item.status === 'filled') return;
  const fieldId = pickerFieldId(item, el);
  item.status = 'filled';
  item.reason = source === 'button' ? '人工选择后回读通过' : '检测到人工选择已回填';
  manuallySkippedPickerIds.delete(fieldId);
  markEl(el, 'filled');
  try { markPickerDone(fieldId, el.ownerDocument || document); } catch { /* 状态存储失败不影响页面结果 */ }

  if (stats) {
    stats.filled += 1;
    stats.picker = Math.max(0, stats.picker - 1);
  }
  // FILL_DONE 可能已用跨 frame 的可序列化副本替换 lastResult；同步其中对应项与总计。
  if (lastResult && lastResult.items !== items) {
    const mirrored = lastResult.items.find((candidate) => candidate.status === 'picker' && candidate.field === item.field && candidate.label === item.label);
    if (mirrored) {
      mirrored.status = 'filled';
      mirrored.reason = item.reason;
      lastResult.stats.filled += 1;
      lastResult.stats.picker = Math.max(0, lastResult.stats.picker - 1);
    }
  }
  if (isTop) {
    telemetryState = applyFillTelemetryCounts(telemetryState, {
      filled: telemetryState.counts.filled + 1,
      waiting: Math.max(0, telemetryState.counts.waiting - 1),
    });
    emitTelemetry({
      stage: 'picking',
      level: 'success',
      action: source === 'button' ? '人工选择已确认并回读通过' : '已自动检测到人工选择回填',
      targetLabel: item.label,
      field: item.field,
      recoverable: true,
    });
    setPanelStatus(`✅ ${item.label} 已回填，正在继续后续弹窗任务`);
  }
  resumePickerQueueWhenSafe(items, stats, roots, generation, ctx);
  scheduleManualResumeRound(ctx);
}

/**
 * 功能:J01 人工接管完成后的续轮——与"终态即最终"保持一致。
 * 说明:等待人工只是暂停(轮次未被后台收口),人工完成后:
 * ① 通知后台解除暂停(恢复硬 deadline 策略);
 * ② 重新读档案并跑一轮填写,让被父 picker 阻塞的依赖者在"父已重新验证"后放行;
 * ③ 结果并入本轮统计,待工作集合归零后照常发终态;若仍有等待人工则再次以暂停上报。
 */
function scheduleManualResumeRound(ctx: RunSnapshot | null): void {
  if (!ctx || !isTop || !runStillActive(ctx)) return;
  const runId = ctx.runId;
  if (manualResumeTimer) clearTimeout(manualResumeTimer);
  manualResumeRelease?.();
  const release = trackAsyncWork(ctx); // 排队阶段也属于未完成工作，不能在400ms内提前终态。
  manualResumeRelease = release;
  manualResumeTimer = setTimeout(() => {
    manualResumeTimer = null;
    if (!runStillActive(ctx)) { release(); return; }
    void (async () => {
      try {
        // ① 解除后台暂停(带本轮身份,旧轮/未知轮由后台拒绝)。
        const resumed = await chrome.runtime.sendMessage({
          type: 'FILL_RESUME',
          runId,
          docId: documentIdentity(document),
          frameSeq: nextFrameSeq(),
          stats: lastResult?.stats,
          items: lastResult ? lastResult.items.map((item) => toPlainFillItem(item)) : [],
        });
        if (!runStillActive(ctx)) return;
        if (resumed?.ok !== true || resumed.runId !== runId) {
          deactivateRun(runId, 'cancelled', 'resume-rejected');
          return;
        }
        manuallyPausedRunId = '';
        // ② 重新读档案并续填(父 picker 已在人工步骤后重新解析,依赖者此时才被放行)。
        const raw = await loadProfile().catch(() => null);
        if (!raw || !runStillActive(ctx)) return;
        const profile = profileForCurrentPage(raw);
        const roundRes = await fillCurrentDocument(profile, false, false, ctx);
        if (!runStillActive(ctx)) return;
        const merged = mergeResumeResults(lastResult, roundRes);
        lastResult = merged;
        lastResultRunId = runId;
        writeTableEvidence(document);
        scheduleSettleChecks(merged.items, merged.stats, ctx);
        if (isTop) {
          recordFillResultTelemetry(merged.items, merged.stats);
          setPanelStatus(formatStats(merged.stats));
        }
        // ③ 工作集合归零后由统一出口决定"终态"或再次"暂停"。
        scheduleTerminalWhenIdle(runId);
      } catch {
        if (runStillActive(ctx)) deactivateRun(runId, 'cancelled', 'resume-unavailable');
      } finally { release(); if (manualResumeRelease === release) manualResumeRelease = null; }
    })();
  }, 400);
}

/**
 * 功能：用户跳过后等待当前弹窗关闭或字段被实际回填，再恢复后续队列。
 * 只保留一个页面级轮询，并持续到弹窗关闭、字段回填、元素销毁或页面卸载；
 * 弹窗仍占用页面时绝不冒险打开下一个 picker。
 */
function waitForSkippedPickerRelease(
  item: FillItem,
  el: HTMLElement,
  items: FillItem[],
  stats: FillStats | undefined,
  roots: HTMLElement[],
  generation: number,
  ctx: RunSnapshot | null = null,
): void {
  clearPickerReleaseWait();
  pickerReleasePending = true;
  const checkRelease = (): void => {
    if (generation !== pickerRunGeneration || !el.isConnected) {
      clearPickerReleaseWait();
      return;
    }
    if (!controlEmpty(el)) {
      clearPickerReleaseWait();
      completeManualPicker(item, el, items, stats, roots, generation, 'automatic', ctx);
      return;
    }
    const visibleNow = new Set(visibleDialogRoots(document));
    const currentDialogStillOpen = roots.length
      ? roots.some((root) => root.isConnected && visibleNow.has(root))
      : visibleNow.size > 0;
    if (!currentDialogStillOpen) {
      clearPickerReleaseWait();
      void attemptPickers(items, stats, ctx);
      return;
    }
  };
  pickerReleaseTimer = setInterval(checkRelease, 600);
  checkRelease();
}

/**
 * 功能：将当前 picker 移交给用户，并把完成/跳过动作接回原队列。
 * 安全原因由调用方提供固定脱敏文本，不读取或展示 valuePreview。
 */
function handoffPicker(
  item: FillItem,
  el: HTMLElement,
  items: FillItem[],
  stats: FillStats | undefined,
  roots: HTMLElement[],
  safeReason: string,
  ctx: RunSnapshot | null = null,
): void {
  if (!pickerHandoffController) return;
  const generation = pickerRunGeneration;
  const fieldId = pickerFieldId(item, el);
  try { markPickerManual(fieldId, safeReason, document); } catch { /* 忽略 */ }
  pickerHandoffController.show({
    fieldLabel: item.label,
    safeReason,
    targetEl: el,
    isFilled: () => el.isConnected && !controlEmpty(el),
    isPopupOpen: roots.length ? () => {
      const visible = new Set(visibleDialogRoots(document));
      return roots.some((root) => root.isConnected && visible.has(root));
    } : undefined,
    onComplete: (source) => completeManualPicker(item, el, items, stats, roots, generation, source, ctx),
    onPopupClosed: () => {
      if (generation !== pickerRunGeneration) return;
      if (isTop) emitTelemetry({
        stage: 'picking',
        level: 'warning',
        action: '选择窗口已关闭，字段仍待人工处理',
        targetLabel: item.label,
        field: item.field,
        reason: '未检测到字段回填，本轮不再自动打开该字段',
        recoverable: true,
      });
      resumePickerQueueWhenSafe(items, stats, [], generation, ctx);
    },
    onSkip: () => {
      if (generation !== pickerRunGeneration) return;
      manuallySkippedPickerIds.add(fieldId);
      try { markPickerManual(fieldId, '用户选择本轮跳过，保留人工待处理', document); } catch { /* 忽略 */ }
      if (isTop) {
        emitTelemetry({
          stage: 'picking',
          level: 'warning',
          action: '已跳过当前弹窗字段',
          targetLabel: item.label,
          field: item.field,
          reason: '本轮停止自动重试，字段仍保留为人工待处理',
          recoverable: true,
        });
        setPanelStatus(`⏭️ ${item.label} 已在本轮跳过；关闭当前弹窗后将继续其他任务`);
      }
      waitForSkippedPickerRelease(item, el, items, stats, roots, generation, ctx);
    },
  });
}

/** 弹窗选择框自动点选一次（已填的不动，无法匹配的留给人工） */
async function attemptPickers(items: FillItem[], stats?: FillStats, ctx: RunSnapshot | null = null): Promise<void> {
  if (!isTop) return;
  // 全局互斥：多个延时补填轮次不得同时运行不同字段的弹窗任务。
  if (pickersDepth > 0 || activePick || pickerReleasePending || pickerHandoffController?.hasActiveTask()) return;
  pickersDepth += 1;
  let manualHint: string | null = null;
  try {
    manualHint = await attemptPickersInner(items, stats, ctx);
  } finally {
    pickersDepth -= 1;
  }
  // 每轮点选结束立即更新进度，避免"正在自动选择"卡住不动；行任务也结束后才宣告完成
  if (manualHint) {
    if (isTop) {
      setPanelStatus(`🎯 ${manualHint}：弹窗已自动填好类别与关键字——若结果未显示请点「查询」，再点行前绿色对勾；完成后自动继续`);
      setFillProgress(48, '🔔 需要人工协助', `请点「查询」与行前绿色对勾（${manualHint}）`);
    }
  } else if (isTop) {
    if (readRowJobs().length || rowJobsRunning) setFillProgress(50, '🔄 正在自动加行', '弹窗选择完成，继续处理表格…');
    else finishFillBanner('填充完成', '请核对绿色高亮后保存', ctx?.runId);
  }
}

async function attemptPickersInner(items: FillItem[], stats?: FillStats, ctx: RunSnapshot | null = null): Promise<string | null> {
  if (!runStillActive(ctx)) return null; // G04:导航/换代/新轮后旧 picker 不再继续
  // G07b:picker 冲突判定必须先确定当前 input 的角色(代码载体 / 名称载体 / 显示载体),
  // 绝不能拿"名称框的值"去和代码比较(会把合法名称误判为代码冲突)。
  for (const it of items) {
    if (it.status !== 'picker' || !it.el) continue;
    const input = it.el as HTMLInputElement;
    if (input.tagName !== 'INPUT') continue;
    const expectedCode = input.getAttribute('data-tui-picker-code') || undefined;
    const readList = (attr: string): string[] => {
      try {
        const parsed = JSON.parse(input.getAttribute(attr) || '[]');
        return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? parsed : [];
      } catch {
        return [];
      }
    };
    const matchesAny = (selectors: string[]): boolean => selectors.some((sel) => {
      try { return input.matches(sel); } catch { return false; }
    });
    const codeSelectors = readList('data-tui-picker-code-selectors');
    const nameSelectors = readList('data-tui-picker-name-selectors');
    const displaySelectors = readList('data-tui-picker-display-selectors');
    const isCodeCarrier = codeSelectors.length > 0 ? matchesAny(codeSelectors) : true;
    const isNameCarrier = nameSelectors.length > 0 && matchesAny(nameSelectors);
    const isDisplayCarrier = displaySelectors.length > 0 && matchesAny(displaySelectors);
    // 代码载体:才做"代码冲突"判定。
    if (isCodeCarrier && !isNameCarrier && !isDisplayCarrier) {
      const codeVerdict = pickerCodeConflictDecision(input.value, expectedCode);
      if (codeVerdict === 'conflict') {
        it.status = 'conflict';
        it.reason = '页面代码值已存在且与档案不同,已保留原值(未自动覆盖)';
        markEl(it.el, 'missing');
        continue;
      }
    }
    // 名称/显示载体:只检查"名称是否与期望一致",不做代码比较。
    const readFirstValue = (selectors: string[]): string => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (el && typeof el.value === 'string') return el.value.trim();
        } catch { /* 无效选择器跳过 */ }
      }
      return '';
    };
    const nameFilled = readFirstValue(nameSelectors) !== '';
    const displayFilled = readFirstValue(displaySelectors) !== '';
    if (!isCodeCarrier || isNameCarrier || isDisplayCarrier) {
      const pair = pickerPairVerdict({
        code: isCodeCarrier && !isNameCarrier && !isDisplayCarrier ? input.value : (expectedCode ? readFirstValue(codeSelectors) : ''),
        expectedCode,
        nameFilled,
        displayFilled,
      });
      if (pair === 'conflict') {
        it.status = 'conflict';
        it.reason = '名称/显示框已有内容但代码为空或与档案不一致,保留现有内容待人工确认';
        markEl(it.el, 'missing');
      }
    }
  }
  // 地区三联直写优先：直接写 6 位区划码+名称，免开树弹窗（东华/北理工式 chooseArea，成熟填表软件同款做法）；树弹窗仅兜底
  directFillRegionTriplets(document, items);
  // 代码+名称成对字段共用同一个"选择"按钮：同字段+同单元格/同行的项只处理一次
  const processed = new Map<string | null, Set<Element>>();
  const wasProcessed = (field: string | null, scope: Element | null): boolean => {
    if (!scope) return false;
    const s = processed.get(field);
    return !!s && s.has(scope);
  };
  const markProcessed = (field: string | null, scope: Element | null): void => {
    if (!scope) return;
    let s = processed.get(field);
    if (!s) {
      s = new Set();
      processed.set(field, s);
    }
    s.add(scope);
  };
  let manualHint: string | null = null;
  // G07b:已删除"看起来不是纯数字就清空成对框"的无证据自愈路径——
  // 未经所有权证明的页面值一律保留;冲突/异常交由字段级等待原因与人工处理。
  const pickTotal = Math.max(1, items.filter((i) => i.status === 'picker').length);
  let pickIdx = 0;
  const deadFields = new Set<string | null>();
  for (const it of items) {
    if (it.status !== 'picker') continue;
    if (deadFields.has(it.field)) continue; // 同字段兄弟项（代码/名称/隐藏框）共用同一弹窗，本轮已失败就不再重复弹
    const el = it.el as HTMLElement | undefined;
    if (!el || !document.documentElement.contains(el)) continue;
    const fieldId = pickerFieldId(it, el);
    // 人工接管或用户本轮跳过的字段由卡片/释放轮询负责，延时补填不得再次打开它。
    if (manuallySkippedPickerIds.has(fieldId) || isPickerManual(fieldId, document)) continue;
    if (!controlEmpty(el)) continue; // 已选过（保存后页面可能已回显）→ 不动
    const cell = el.closest('td,th') || el.parentElement;
    const scopeKey = cell || el.closest('tr');
    if (wasProcessed(it.field, scopeKey)) continue;
    markProcessed(it.field, scopeKey);
    if (cell) {
      // 同单元格中"同字段"的其他控件已有值（弹窗点选常同时写代码+名称两个框）→ 该弹窗已选过，跳过。
      // 必须限定同字段：无单元格布局下父容器可能是 body，日期等其他字段先被填好时，
      // 院校/专业弹窗不得被误判为"已选"而永久跳过（合工大向导教育步骤）。
      if (Array.from(cell.querySelectorAll('input, select, textarea')).some((x) => x !== el && !controlEmpty(x) && items.some((o) => o.el === x && o.field === it.field))) continue;
    }
    // 同一字段弹窗自动尝试最多 3 次；超限转人工引导，不再反复弹窗打扰
    let fails: Record<string, number> = {};
    try {
      fails = JSON.parse(sessionStorage.getItem('tui-pick-fails') || '{}');
    } catch {
      fails = {};
    }
    const failKey = `${(el as HTMLInputElement).name || el.id || it.field}`;
    if ((fails[failKey] || 0) >= 3) continue;
    // 每字段弹窗调用总次数上限（页面被误回发重载时也能终止循环）
    let rounds: Record<string, number> = {};
    try {
      rounds = JSON.parse(sessionStorage.getItem('tui-pick-rounds') || '{}');
    } catch {
      rounds = {};
    }
    if ((rounds[failKey] || 0) >= 4) {
      manualHint = manualHint || it.label;
      continue;
    }
    rounds[failKey] = (rounds[failKey] || 0) + 1;
    try {
      sessionStorage.setItem('tui-pick-rounds', JSON.stringify(rounds));
    } catch {
      // 忽略
    }
    // 互斥：该字段已有点选在跑（或卡死保护期内）→ 本轮跳过，不重开弹窗
    if (activePick && activePick.key === failKey && Date.now() - activePick.at < 90_000) continue;
    if (activePick && Date.now() - activePick.at >= 90_000) activePick = null;
    // 逐个处理（弹窗不能同时开多个）
    if (isTop) setFillProgress(40 + Math.round(10 * (pickIdx / pickTotal)), '🎯 正在自动选择弹窗', '正在搜索并确认匹配项', {
      telemetryStage: 'picking',
      targetLabel: it.label,
      field: it.field,
      current: Math.min(pickIdx + 1, pickTotal),
      total: pickTotal,
    });
    pickIdx++;
    activePick = { key: failKey, at: Date.now() };
    let res: 'picked' | 'opened' | 'none' = 'none';
    try {
      res = await pickInPage(document, el, it.valuePreview || '', it.pickerContext, () => !runStillActive(ctx));
    } finally {
      if (activePick && activePick.key === failKey) activePick = null;
    }
    // H04:await 之后原轮失效(导航/换档案/新轮)或目标已脱离文档 → 不再写入状态/标记完成。
    if (!runStillActive(ctx) || !el.isConnected) return manualHint;
    if (!controlEmpty(el)) {
      if (res !== 'opened') closeLeftoverPickers(document); // 成功后清理旧壳，避免遮挡下一字段
      it.status = 'filled';
      markEl(el, 'filled');
      if (isTop) emitTelemetry({ stage: 'picking', level: 'success', action: '弹窗选中并确认完成', targetLabel: it.label, field: it.field, current: pickIdx, total: pickTotal });
      fails[failKey] = 0;
      // 断点续填：标记 picker 为 done，sessionStorage 中该 field 移出可恢复列表
      try {
        markPickerDone(fieldId, document);
      } catch { /* 忽略 */ }
      try {
        const r2 = JSON.parse(sessionStorage.getItem('tui-pick-rounds') || '{}');
        r2[failKey] = 0;
        sessionStorage.setItem('tui-pick-rounds', JSON.stringify(r2));
      } catch {
        // 忽略
      }
    } else {
      await sleep(800); // 回发型选择器点选后主页面值可能稍后才回填
      // H04:等待回填期间原轮失效 → 不得把旧轮结果标记为 filled。
      if (!runStillActive(ctx) || !el.isConnected) return manualHint;
      if (!controlEmpty(el)) {
        if (res !== 'opened') closeLeftoverPickers(document);
        it.status = 'filled';
        markEl(el, 'filled');
        if (isTop) emitTelemetry({ stage: 'picking', level: 'success', action: '弹窗回填并回读通过', targetLabel: it.label, field: it.field, current: pickIdx, total: pickTotal });
        fails[failKey] = 0;
        // 断点续填：标记 picker 为 done
        try {
          markPickerDone(fieldId, document);
        } catch { /* 忽略 */ }
        try {
          const r2 = JSON.parse(sessionStorage.getItem('tui-pick-rounds') || '{}');
          r2[failKey] = 0;
          sessionStorage.setItem('tui-pick-rounds', JSON.stringify(r2));
        } catch {
          // 忽略
        }
      } else if (res === 'opened' || (isTop && visibleDialogRoots(document).length > 0)) {
        // 仅在驱动明确报告 opened，或页面仍存在可见弹窗时进入人工接管，避免误导用户操作不存在的弹窗。
        const handoffRoots = visibleDialogRoots(document);
        const safeReason = res === 'opened'
          ? '自动匹配未能安全确认最终结果，需要你在已打开的选择窗口中核对'
          : '自动选择后尚未检测到可靠回填，需要你在当前选择窗口中确认';
        manualHint = it.label;
        if (isTop) emitTelemetry({
          stage: 'picking',
          level: 'warning',
          action: '弹窗已打开，等待人工确认',
          targetLabel: it.label,
          field: it.field,
          reason: safeReason,
          current: pickIdx,
          total: pickTotal,
          recoverable: true,
        });
        fails[failKey] = 0;
        deadFields.add(it.field);
        if (isTop) handoffPicker(it, el, items, stats, handoffRoots, safeReason, ctx);
        else {
          // 子 frame 无法创建顶层操作卡片，但仍标记人工态并停止该 frame 队列，避免重复弹窗。
          try { markPickerManual(fieldId, safeReason, document); } catch { /* 忽略 */ }
        }
        // 当前弹窗仍占用页面：必须停止整条队列，禁止专业任务把关键字写进院校弹窗。
        try {
          sessionStorage.setItem('tui-pick-fails', JSON.stringify(fails));
        } catch {
          // 忽略
        }
        break;
      } else if (res === 'picked') {
        // 已点选但值未回填（服务器慢/页面被回发清空）：不记失败，允许下一轮再试
        closeLeftoverPickers(document);
        fails[failKey] = 0;
      } else {
        closeLeftoverPickers(document);
        fails[failKey] = (fails[failKey] || 0) + 1;
        // 断点续填：标记 picker 失败（累加 attempt，超过 MAX 转 failed）
        try {
          markPickerFailed(fieldId, 'pickInPage-returned-non-picked', document);
        } catch { /* 忽略 */ }
        if (isTop) emitTelemetry({
          stage: 'picking',
          level: 'error',
          action: '未能完成弹窗选择',
          targetLabel: it.label,
          field: it.field,
          reason: '没有找到可安全确认的匹配结果',
          current: pickIdx,
          total: pickTotal,
          recoverable: true,
        });
        deadFields.add(it.field);
      }
    }
    try {
      sessionStorage.setItem('tui-pick-fails', JSON.stringify(fails));
    } catch {
      // 忽略
    }
  }
  return manualHint;
}

/**
 * 功能:保存回发后分多次补填(字段异步就绪需延时重试)。
 * G04:恢复自成一轮并在启动时捕获原轮快照;失效的旧回调直接退出(不重生、不沿用旧资料);
 * 每轮重新读取当前档案,避免旧 profile 复活。
 */
function scheduleRestorePasses(_profile: Profile): void {
  const ctx = captureRunSnapshot(document, location.href, makeRunId());
  activeRunSnapshot = ctx;
  activeRunId = ctx.runId;
  const run = async (attemptPickersToo: boolean): Promise<void> => {
    if (!runStillActive(ctx)) return; // 失效不重生
    const raw = await loadProfile().catch(() => null);
    if (!runStillActive(ctx) || !raw) return;
    const profile = profileForCurrentPage(raw);
    const res = await fillCurrentDocument(profile, false, true, ctx);
    if (!runStillActive(ctx)) return;
    writeTableEvidence(document); // 补填后的表格状态是下一次保存的比对基线
    if (isTop && pickersDepth === 0) setFillProgress(93, '🔁 保存后自动补填', '恢复被回发清空的字段…');
    if (attemptPickersToo) scheduleCascadeRetries(res.items, res.stats, ctx);
    scheduleSettleChecks(res.items, res.stats, ctx);
  };
  setTimeout(() => void run(true), 900);
  setTimeout(() => void run(false), 2600);
  setTimeout(() => {
    void run(false).then(() => {
      if (!runStillActive(ctx)) return;
      if (isTop) {
        if (readRowJobs().length || rowJobsRunning) setFillProgress(96, '🔁 自动加行仍在进行', '补填完成，行任务继续…');
        else finishFillBanner('已恢复被清空的字段', '请核对后点保存', ctx?.runId);
      }
      setPanelStatus('🔄 已恢复被清空的字段，请核对后点保存');
    });
  }, 6000);
}

// ===================== 提交前体检 =====================
function closeCheckReport(): void {
  document.getElementById('tui-check-report')?.remove();
}

function showCheckReport(): void {
  const { items, summary } = runPreSubmitCheck(document, activeRules);
  closeCheckReport();
  const box = document.createElement('div');
  box.id = 'tui-check-report';
  box.innerHTML = `<div class="tui-cr-head">🩺 提交前体检<span class="tui-cr-close" title="关闭">✕</span></div><div class="tui-cr-summary">${escapeHtml(summary)}</div>`;
  const list = document.createElement('div');
  list.className = 'tui-cr-list';
  if (!items.length) {
    const ok = document.createElement('div');
    ok.className = 'tui-cr-item ok';
    ok.textContent = '✅ 未发现必填缺失或格式异常，可放心提交（仍请人工核对内容）';
    list.appendChild(ok);
  }
  items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'tui-cr-item ' + it.level;
    row.textContent = `${it.level === 'error' ? '🔴' : '🟡'} ${it.title}：${it.detail}`;
    row.addEventListener('click', () => {
      const el = it.el as HTMLElement | undefined;
      if (el && document.documentElement.contains(el)) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('tui-guide');
        setTimeout(() => el.classList.remove('tui-guide'), 1600);
      }
    });
    list.appendChild(row);
  });
  box.appendChild(list);
  (document.body || document.documentElement).appendChild(box);
  box.querySelector('.tui-cr-close')?.addEventListener('click', closeCheckReport);
}

// ===================== 学校目录（报名入口导航） =====================
type SchoolStatus = 'done' | 'doing';

async function loadSchoolStatus(): Promise<Record<string, SchoolStatus>> {
  try {
    const got = (await chrome.storage.local.get('tui-school-status')) as { 'tui-school-status'?: Record<string, SchoolStatus> };
    return (got && got['tui-school-status']) || {};
  } catch {
    return {};
  }
}

async function saveSchoolStatus(st: Record<string, SchoolStatus>): Promise<void> {
  try {
    await chrome.storage.local.set({ 'tui-school-status': st });
  } catch {
    // 忽略
  }
}

function closeSchoolDirectory(): void {
  document.getElementById('tui-schools')?.remove();
}

/** 学校目录浮层：学校与夏令营/预推免/优本计划分支分别展示并独立记录状态。 */
function showSchoolDirectory(): void {
  closeSchoolDirectory();
  const box = document.createElement('div');
  box.id = 'tui-schools';
  box.innerHTML =
    `<div class="tui-schools-head">🏫 学校目录 · 分项目报名入口<span class="tui-schools-sub">共 ${SCHOOLS_WITH_PROGRAMS.length} 所 · 夏令营/预推免分支互不串用</span><span class="tui-cr-close" title="关闭">✕</span></div>` +
    `<div class="tui-schools-toolbar"><input id="tui-schools-search" type="text" placeholder="搜索学校名 / 网址…"><span id="tui-schools-count"></span></div>` +
    `<div class="tui-schools-list" id="tui-schools-list"></div>`;
  (document.body || document.documentElement).appendChild(box);
  const list = box.querySelector('#tui-schools-list') as HTMLElement;
  const searchEl = box.querySelector('#tui-schools-search') as HTMLInputElement;
  const countEl = box.querySelector('#tui-schools-count') as HTMLElement;
  box.querySelector('.tui-cr-close')?.addEventListener('click', closeSchoolDirectory);
  const curHost = location.hostname || '';
  let statuses: Record<string, SchoolStatus> = {};
  const statusLabel: Record<string, string> = { done: '✓ 已填', doing: '▶ 进行中' };
  const render = () => {
    const f = (searchEl.value || '').trim().toLowerCase();
    const hits = SCHOOLS_WITH_PROGRAMS.filter((s) => !f || s.name.toLowerCase().includes(f) || s.host.toLowerCase().includes(f) || s.entry.toLowerCase().includes(f) || s.programs?.some((p) => `${p.name} ${p.host} ${p.entry}`.toLowerCase().includes(f)));
    const doneN = Object.values(statuses).filter((v) => v === 'done').length;
    const doingN = Object.values(statuses).filter((v) => v === 'doing').length;
    countEl.textContent = `匹配 ${hits.length} 所 · 已填 ${doneN} · 进行中 ${doingN}`;
    list.innerHTML = '';
    hits.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'tui-school-item' + (s.host === curHost || s.programs?.some((p) => p.host === curHost) ? ' current' : '');
      const badges: string[] = [];
      if (s.adapter || s.programs?.some((program) => Object.values(program.capabilities).some((status) => status === 'verified' || status === 'experimental'))) badges.push('<span class="tui-school-badge adapter" title="有专项适配">已适配</span>');
      if (s.host === curHost || s.programs?.some((p) => p.host === curHost)) badges.push('<span class="tui-school-badge current">当前站点</span>');
      const programs = s.programs || [];
      row.innerHTML =
        `<div class="tui-school-info"><div class="tui-school-name">${escapeHtml(s.name)}${badges.join('')}</div>` +
        `<div class="tui-school-host">${escapeHtml(s.host)}</div></div>` +
        `<div class="tui-school-actions">${programs.map((p) => {
          const st = statuses[p.id] || '';
          const level = p.capabilities.formFill === 'verified' ? '已验证' : p.capabilities.formFill === 'experimental' ? '实验性' : '仅目录';
          return `<span class="tui-school-program"><button type="button" class="tui-school-open" data-program="${escapeHtml(p.id)}">${escapeHtml(p.name)} ↗</button><button type="button" class="tui-school-status" data-status="${escapeHtml(p.id)}">${st ? statusLabel[st] : level}</button></span>`;
        }).join('')}</div>`;
      row.querySelectorAll<HTMLButtonElement>('[data-program]').forEach((button) => button.addEventListener('click', (e) => {
        e.stopPropagation();
        const program = programs.find((p) => p.id === button.dataset.program);
        if (program) window.open(program.entry, '_blank');
      }));
      row.querySelectorAll<HTMLButtonElement>('[data-status]').forEach((button) => button.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = button.dataset.status!;
        const cur: SchoolStatus | '' = (statuses[key] as SchoolStatus | undefined) || '';
        const next: SchoolStatus | '' = cur === '' ? 'doing' : cur === 'doing' ? 'done' : '';
        if (next) statuses[key] = next;
        else delete statuses[key];
        void saveSchoolStatus(statuses).then(render);
      }));
      list.appendChild(row);
    });
  };
  searchEl.addEventListener('input', render);
  void loadSchoolStatus().then((st) => {
    statuses = st;
    render();
  });
}

// ===================== 自动加行断点续填（ASP.NET 整页回发场景） =====================
const LEGACY_RESUME_KEY = 'tui-pending-rows';
/** 每个页面独立保存安全加行任务，避免同源 iframe 与顶层页面互相覆盖。 */
function rowResumeKey(): string {
  return `tui-pending-rows-v2:${location.origin}${location.pathname}`;
}
/** 标记本标签页已一键填充过的页面 URL：保存回发刷新后据此自动补填被清空的字段 */
const REFILL_KEY = 'tui-refill-url';

interface RowJob {
  type: 'achievements' | 'experiences' | 'family' | 'awards' | 'language';
  startIndex: number;
  attempt: number;
  /** 连续无进展轮数：有行增长或条目推进即清零；达到上限才放弃任务（不再按总点击数计） */
  fails?: number;
}

/** 功能：把内部动态表任务类型转换为用户可理解且不包含真实内容的名称。 */
function rowJobLabel(type: RowJob['type']): string {
  return ({ achievements: '科研成果', experiences: '学习/工作经历', family: '家庭成员', awards: '奖励情况', language: '外语水平' })[type];
}

function readRowJobs(): RowJob[] {
  try {
    const s = sessionStorage.getItem(rowResumeKey());
    return s ? (JSON.parse(s) as RowJob[]) : [];
  } catch {
    return [];
  }
}

function writeRowJobs(jobs: RowJob[]): void {
  try {
    if (jobs.length) sessionStorage.setItem(rowResumeKey(), JSON.stringify(jobs));
    else sessionStorage.removeItem(rowResumeKey());
  } catch {
    // 忽略
  }
}

/** 表格内容证据（只含表格类型与行数/非空行数，不含任何档案值）：保存回发后做假保存比对用 */
// F10:保存证据带采集时间与逻辑页面,超过有效期或换页一律不比较(防"其他页旧证据放行")。
/** 功能：保存证据绑定本页适配版本与完整页面契约；通用页使用核心版本。 */
function currentTableEvidenceScope() {
  const adapter = resolveAdapterForFill(location.href);
  const page = adapter ? resolveAdapterPage(adapter, document, location.href).winner?.page : undefined;
  return makeTableEvidenceScope(routeKeyFor(location.href), adapter?.id || 'generic', adapter?.version || chrome.runtime.getManifest().version, page?.id || 'generic', page || null);
}

function writeTableEvidence(doc: Document): void {
  try {
    sessionStorage.setItem('tui-table-evidence', JSON.stringify(createTableEvidenceEnvelope(doc, currentTableEvidenceScope())));
  } catch {
    // 忽略
  }
}

function readTableEvidence(): TableEvidence[] {
  try {
    return readScopedTableEvidence(sessionStorage.getItem('tui-table-evidence'), currentTableEvidenceScope());
  } catch {
    return [];
  }
}

// 行任务互斥：防止延时补填轮次与主流程并发重跑（重复点"添加"）；rerun 标记保证排队的新任务不丢失
let rowJobsRerun = false;

async function processRowJobs(profile: Profile, ctx: RunSnapshot | null = null): Promise<void> {
  if (!isTop) return;
  if (rowJobsRunning) {
    rowJobsRerun = true; // 已有流程在跑：结束后立即自动再跑一轮（第一遍点击常因回发刷新丢上下文而漏行）
    try {
      const dbg = JSON.parse(sessionStorage.getItem('tui-rowjobs-debug') || '[]');
      dbg.push({ at: Date.now(), type: 'queue', note: 'busy-rerun-flagged' });
      sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(sanitizeDiagnosticValue(dbg.slice(-20))));
    } catch {
      // 忽略
    }
    return;
  }
  rowJobsRunning = true;
  try {
    await processRowJobsInner(profile, ctx);
  } finally {
    rowJobsRunning = false;
    if (rowJobsRerun) {
      rowJobsRerun = false;
      void processRowJobs(profile, ctx);
    }
  }
}

async function processRowJobsInner(profile: Profile, ctx: RunSnapshot | null = null): Promise<void> {
  if (!runStillActive(ctx)) return; // G04:导航/换代/新轮后行任务停止(断点仍在 sessionStorage,新轮可恢复)
  const jobs = readRowJobs();
  // 等网格稳定（回发后 datagrid 异步渲染，过早填充会被抹掉/找不到表）：
  // 五类网格（经历/成果/奖励/家庭/语言考试）都参与探测；表已出现且行数连续两次一致才开填；
  // 页面还没有网格时最多等 3 秒（防止"页面未渲染完就点击填充"→ 前几次点了没反应）
  let lastCount = -1;
  let zeroRounds = 0;
  for (let i = 0; i < 14; i++) {
    const info =
      findExperienceTable(document) ||
      findAchievementTable(document) ||
      findAwardTable(document) ||
      findFamilyTable(document) ||
      findLanguageTable(document);
    const count = info ? info.table.rows.length : 0;
    if (count > 0 && count === lastCount) break;
    lastCount = count;
    if (count === 0) zeroRounds++;
    if (zeroRounds >= 6) break; // 等 3 秒仍无网格：不再空等，交给填写函数按"本页无该表"处理
    await sleep(500);
    // H04:等待网格期间原轮失效 → 立即停止,不得继续加行/写断点。
    if (!runStillActive(ctx)) return;
  }
  if (!isTop) return;
  const entriesOf = (type: RowJob['type'], profile: Profile): unknown[] => {
    switch (type) {
      case 'achievements':
        return profile.research.filter((r) => r.title && r.title.trim()).slice(0, 20);
      case 'family':
        return profile.familyMembers.filter((m) => m.name && m.name.trim()).slice(0, 10);
      case 'awards':
        return profile.awards.filter((a) => a.content && a.content.trim()).slice(0, 20);
      case 'language':
        return Array.from({ length: languageExamEntryCount(profile) });
      default:
        return profile.experiences.filter((e) => (e.org && e.org.trim()) || (e.start && e.start.trim())).slice(0, 20);
    }
  };
  // 进度条：按 4 类行任务"已处理条目 / 总条目"汇总（任务状态随页面回发落盘，整页刷新后进度不断档）
  const updateRowJobsProgress = (stage: string) => {
    if (!isTop) return;
    let sumDone = 0;
    let sumTotal = 0;
    for (const j of jobs) {
      const len = entriesOf(j.type, profile).length;
      sumTotal += len;
      sumDone += Math.min(j.startIndex, len);
    }
    const ratio = sumTotal ? sumDone / sumTotal : 1;
    const current = jobs[0];
    const currentEntries = current ? entriesOf(current.type, profile) : [];
    const targetLabel = current ? `${rowJobLabel(current.type)} · 第 ${Math.min(current.startIndex + 1, Math.max(1, currentEntries.length))} 行` : '动态表格';
    setFillProgress(50 + Math.round(45 * ratio), stage, '逐行新增并填写；保存、下一步和提交仍由你操作', {
      telemetryStage: 'addingRows',
      targetLabel,
      current: sumDone,
      total: sumTotal,
    });
  };
  // 轮次预算与剩余条目挂钩：14 条成果需要逐条加行，固定 15 轮可能不够
  const maxRounds = Math.max(15, jobs.reduce((sum, j) => sum + entriesOf(j.type, profile).length, 0) + 4);
  for (let round = 0; round < maxRounds && jobs.length; round++) {
    const job = jobs[0];
    if ((job.fails || 0) >= ROW_JOB_FAIL_CAP) {
      jobs.shift();
      writeRowJobs(jobs);
      if (isTop) setPanelStatus('自动加行连续未成功：请手动点一次「新增一行」后再次「一键填充」');
      break;
    }
    const entries = entriesOf(job.type, profile);
    if (job.startIndex >= entries.length) {
      jobs.shift();
      writeRowJobs(jobs);
      updateRowJobsProgress('🔄 正在自动加行');
      continue;
    }
    // 按任务自己的表测量行数（家庭/奖项/经历/成果各有各的网格）
    const infoOf = (type: RowJob['type']) =>
      type === 'family'
        ? findFamilyTable(document)
        : type === 'language'
          ? findLanguageTable(document)
        : type === 'awards'
          ? findAwardTable(document)
          : type === 'achievements'
            ? findAchievementTable(document)
            : findExperienceTable(document);
    const infoBefore = infoOf(job.type);
    const rowsBefore = infoBefore ? infoBefore.table.rows.length : -1;
    // 本轮起点必须在 beforeAdd 修改断点前冻结；否则 callback 写入 i 后再 +n 会把进度重复累加并跳过记录。
    const callStart = job.startIndex;
    let clicked = false;
    const beforeAdd = (i: number): number => {
      clicked = true;
      job.startIndex = i;
      job.attempt += 1;
      writeRowJobs(jobs); // 点击前落盘：整页刷新后新上下文据此恢复
      updateRowJobsProgress('🔄 正在自动加行');
      return job.attempt - 1; // 返回 0 起点击序号：clickPageAction 按序号轮换回发方式（0 标准回发 / 1 location 求值 / 2 原生点击）
    };
    let n = 0;
    let observedNextIndex = callStart;
    const observeProcessed = (nextIndex: number): void => {
      observedNextIndex = Math.max(observedNextIndex, nextIndex);
    };
    // 单轮加行失败预算与剩余条目挂钩（此前固定 10/12 次，14 条成果常因预算耗尽停在 10 条附近）
    const addBudget = Math.min(Math.max(entries.length - job.startIndex, 1) + 2, 25);
    // H04:行内每个加行/写入恢复点复核原轮——换档案/导航/新轮后立即停止,不得继续写。
    const rowCancelled = (): boolean => !runStillActive(ctx);
    try {
      n =
        job.type === 'achievements'
          ? await fillAchievements(profile, document, job.startIndex, beforeAdd, addBudget, false, observeProcessed, rowCancelled)
          : job.type === 'language'
            ? await fillLanguageExams(profile, document, job.startIndex, beforeAdd, addBudget, false, rowCancelled)
          : job.type === 'family'
            ? await fillFamilyMembers(profile, document, job.startIndex, beforeAdd, addBudget, false, observeProcessed, rowCancelled)
            : job.type === 'awards'
              ? await fillAwardRows(profile, document, job.startIndex, beforeAdd, addBudget, false, observeProcessed, rowCancelled)
              : await fillExperiences(profile, document, job.startIndex, beforeAdd, addBudget, false, observeProcessed, rowCancelled);
    } catch (e) {
      n = 0;
      try {
        const dbg = JSON.parse(sessionStorage.getItem('tui-rowjobs-debug') || '[]');
        dbg.push({ at: Date.now(), type: job.type, error: String((e as Error).message || e).slice(0, 60) });
        sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(sanitizeDiagnosticValue(dbg.slice(-20))));
      } catch {
        // 忽略
      }
    }
    const next = nextRowJobIndex(callStart, n, observedNextIndex);
    // H04:加行 await 之后原轮失效 → 不写断点、不发遥测(断点仍在 sessionStorage,新轮可恢复)。
    if (!runStillActive(ctx)) return;
    if (isTop && next > callStart) emitTelemetry({
      stage: 'addingRows',
      level: 'success',
      action: next - callStart > 1 ? `已填写 ${next - callStart} 行并完成回读` : '本行已填写并完成回读',
      targetLabel: `${rowJobLabel(job.type)} · 第 ${Math.min(next, entries.length)} 行`,
      current: Math.min(next, entries.length),
      total: entries.length,
    });
    // 本轮走向判定：只有"目标表确实不在本页"才按无表放弃；表格在但加行无效时保留任务并累计连续失败
    const infoAfter = infoOf(job.type);
    const rowsAfter = infoAfter ? infoAfter.table.rows.length : -1;
    const decision = decideRowJobRound({
      callStart,
      nextIndex: next,
      clicked,
      processed: n,
      rowsBefore,
      rowsAfter,
      failsBefore: job.fails || 0,
      entriesLength: entries.length,
      tablePresentNow: !!infoAfter,
    });
    if (decision.action === 'complete') {
      // 本类型条目已全部处理（等价于 next >= entries.length）
      jobs.shift();
      writeRowJobs(jobs);
      continue;
    }
    if (decision.action === 'drop-no-table') {
      // 该类型表格不在本页（如已翻到下一步）：放弃任务，但明确告知剩余条数，不再静默丢弃
      if (isTop) emitTelemetry({
        stage: 'addingRows',
        level: 'warning',
        action: `${rowJobLabel(job.type)}还有 ${decision.remaining} 条未填`,
        reason: '目标页面没有对应表格；请返回对应页面再次「一键填充」',
        recoverable: true,
      });
      jobs.shift();
      writeRowJobs(jobs);
      try {
        const dbg = JSON.parse(sessionStorage.getItem('tui-rowjobs-debug') || '[]');
        dbg.push({ at: Date.now(), type: job.type, note: 'dropped-no-table-on-page', remaining: decision.remaining });
        sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(sanitizeDiagnosticValue(dbg.slice(-20))));
      } catch {
        // 忽略
      }
      updateRowJobsProgress('🔄 正在自动加行');
      continue;
    }
    if (decision.action === 'drop-fails') {
      jobs.shift();
      writeRowJobs(jobs);
      if (isTop) setPanelStatus(`${rowJobLabel(job.type)}自动加行未成功${decision.remaining > 0 ? `（剩余 ${decision.remaining} 条）` : ''}：请手动新增一行后再次「一键填充」`);
      try {
        const dbg = JSON.parse(sessionStorage.getItem('tui-rowjobs-debug') || '[]');
        dbg.push({ at: Date.now(), type: job.type, note: 'dropped-fail-cap', remaining: decision.remaining });
        sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(sanitizeDiagnosticValue(dbg.slice(-20))));
      } catch {
        // 忽略
      }
      updateRowJobsProgress('🔄 正在自动加行');
      continue;
    }
    job.fails = decision.fails;
    job.startIndex = decision.startIndex;
    writeRowJobs(jobs);
    if (isTop && decision.warn) emitTelemetry({
      stage: 'addingRows',
      level: 'warning',
      action: `${rowJobLabel(job.type)}加行未生效（连续 ${decision.fails} 轮）`,
      reason: '页面可能已达行数上限或加行按钮无响应；请核对页面后手动新增一行',
      recoverable: true,
    });
    updateRowJobsProgress('🔄 正在自动加行');
    try {
      const dbg = JSON.parse(sessionStorage.getItem('tui-rowjobs-debug') || '[]');
      dbg.push({ at: Date.now(), type: job.type, startIndex: job.startIndex, n, clicked, rowsBefore, rowsAfter, fails: job.fails });
      sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(sanitizeDiagnosticValue(dbg.slice(-20))));
    } catch {
      // 忽略
    }
    // 点过"添加/保存"后一律继续下一轮重试：原地加行成功→下一轮补下一条；
    // 整页刷新→由载入恢复接管；加行未生效→下一轮再点。不再空等，避免任务搁浅。
    continue;
  }
  if (isTop && !jobs.length) {
    setPanelStatus('表格自动加行填写完成 ✅（绿色高亮，请核对后保存）');
    finishFillBanner('表格自动加行填写完成', '绿色高亮，请核对后保存', ctx?.runId);
  } else {
    updateRowJobsProgress('🔄 正在自动加行');
  }
  snapshotFillState(document);
  writeTableEvidence(document);
  // 回发型页面：写完后定时补写（纯填充、不点按钮），防止网格重新渲染抹掉内容；网格异步渲染慢，末尾再补一轮
  const refillCancelled = (): boolean => !runStillActive(ctx); // H04:补写轮次同样受原轮约束
  void (async () => {
    await sleep(2500);
    await fillExperiences(profile, document, 0, undefined, 0, undefined, undefined, refillCancelled);
    await fillFamilyMembers(profile, document, 0, undefined, 0, undefined, undefined, refillCancelled);
    await sleep(2500);
    await fillAchievements(profile, document, 0, undefined, 0, undefined, undefined, refillCancelled);
    await fillAwardRows(profile, document, 0, undefined, 0, undefined, undefined, refillCancelled);
    await fillExperiences(profile, document, 0, undefined, 0, undefined, undefined, refillCancelled);
    snapshotFillState(document);
    writeTableEvidence(document);
    await sleep(6000);
    await fillFamilyMembers(profile, document, 0, undefined, 0, undefined, undefined, refillCancelled);
    await fillAwardRows(profile, document, 0, undefined, 0, undefined, undefined, refillCancelled);
    snapshotFillState(document);
    writeTableEvidence(document);
  })();
}

/**
 * 为当前 frame 中实际存在的动态表建立任务。任务只允许点击“新增一行”，
 * 不允许借“保存/添加落库”换行，也不会点击下一步或提交。
 */
function startSafeRowJobs(profile: Profile, ctx: RunSnapshot | null = null): void {
  if (!isTop) return;
  const jobs: RowJob[] = [];
  if (findAchievementTable(document) && profile.research.some((row) => row.title?.trim())) jobs.push({ type: 'achievements', startIndex: 0, attempt: 0 });
  if (findAwardTable(document) && profile.awards.some((row) => row.content?.trim())) jobs.push({ type: 'awards', startIndex: 0, attempt: 0 });
  if (findExperienceTable(document) && profile.experiences.some((row) => row.org?.trim() || row.start?.trim())) jobs.push({ type: 'experiences', startIndex: 0, attempt: 0 });
  if (findFamilyTable(document) && profile.familyMembers.some((row) => row.name?.trim())) jobs.push({ type: 'family', startIndex: 0, attempt: 0 });
  if (findLanguageTable(document) && languageExamEntryCount(profile)) jobs.push({ type: 'language', startIndex: 0, attempt: 0 });
  writeRowJobs(jobs);
  if (jobs.length) void processRowJobs(profile, ctx);
}

const handlers: PanelHandlers = {
  onAction: async (act: string) => {
    if (act === 'fill') {
      setPanelBusy(true);
      beginFillTelemetry();
      setPanelStatus('⚡ 正在扫描页面并自动填写…');
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'PANEL_FILL' });
        // 成功摘要统一由 FILL_DONE 展示，避免此响应覆盖等待人工/超时等区域边界提示。
        if (!(resp && resp.ok)) {
          const reason = String((resp && (resp as { reason?: string }).reason) || '');
          if (reason === 'superseded' || reason === 'cancelled') {
            // J00:本轮被新轮取代/已取消——这不是"未登录",也不能解锁正在运行的新轮。
            emitTelemetry({ stage: 'cancelled', level: 'info', action: '本轮已被新的填写取代', reason: '已取消的轮次不再继续' });
            setPanelStatus('本轮填写已被新的填写取代');
          } else if (reason === 'no-receiver') {
            emitTelemetry({ stage: 'failed', level: 'error', action: '页面未接收填写指令', reason: '请刷新页面后重试', recoverable: true });
            setPanelBusy(false);
            setPanelStatus('填充失败：页面未接收指令，请刷新后重试');
          } else {
            emitTelemetry({ stage: 'failed', level: 'error', action: '无法开始填写', reason: '请确认已登录并停留在报名填表页', recoverable: true });
            setPanelBusy(false);
            setPanelStatus('填充失败：请确认已登录并停留在报名填表页');
          }
        }
      } catch {
        emitTelemetry({ stage: 'failed', level: 'error', action: '扩展后台未就绪', reason: '请刷新页面后重试', recoverable: true });
        setPanelBusy(false);
        setPanelStatus('扩展后台未就绪：请刷新页面后重试');
      }
    } else if (act === 'schools') {
      showSchoolDirectory();
    } else if (act === 'check') {
      showCheckReport();
    } else if (act === 'importprofile') {
      try {
        const profile = await loadProfile();
        const adapterPackage = resolveAdapterForFill(location.href);
        if (!adapterPackage) {
          const res = importFromPage(profile, document, activeRules);
          await saveProfile(profile);
          if (!res.summary.length) setPanelStatus('本页没有可提取的已填信息（当前站点尚无适配包，已使用兼容提取器）');
          else setPanelStatus(`兼容提取器已保存 ${res.summary.length} 项空缺字段，请在档案编辑器中核对。`);
          return;
        }
        const snapshot = captureCurrentPage(document, location.href, activeRules, [adapterPackage]);
        let session = addSnapshot(await loadCrawlSession(), snapshot, adapterPackage);
        if (adapterPackage.id === 'minimal-bupt-mastertm' && snapshot.pageId === 'selection') {
          const choices = applicationChoicesFromPage(document);
          if (choices.length > 1 && !session.selectedApplicationKey) {
            const answer = window.prompt(`检测到 ${choices.length} 条报名记录。请输入序号确认（默认 1，但不会自动切换）：\n${choices.map((choice, index) => `${index + 1}. ${choice.label}`).join('\n')}`, '1');
            if (answer == null) throw new Error('用户取消了报名记录选择');
            session = rememberApplicationChoice(session, choices, Number(answer) - 1);
          } else {
            session = rememberApplicationChoice(session, choices);
          }
        }
        await saveCrawlSession(session);
        const preview = previewCrawlMerge(profile, session);
        const newFields = preview.items.filter((x) => x.kind === 'new').length;
        const conflicts = preview.items.filter((x) => x.kind === 'conflict' || x.kind === 'locked').length;
        const newRows = Object.values(preview.newRows).reduce((n, rows) => n + (rows?.length || 0), 0);
        const pendingRows = preview.pendingClassifications.length;
        const collected = Object.keys(session.snapshots).length;
        const pending = session.expectedPages.filter((id) => !session.snapshots[id]).length;
        const confirmed = window.confirm(`采集预览（${adapterPackage.schoolName} · ${snapshot.pageName}）\n已累计 ${collected} 个步骤，待采集 ${pending} 个步骤。\n新增字段 ${newFields}，新增表格行 ${newRows}，待分类 ${pendingRows}，冲突/锁定 ${conflicts}。\n\n确认后仅合并新增内容并锁定；冲突保留原档案值。`);
        if (!confirmed) {
          setPanelStatus(`本页已加入爬取会话但尚未合并：新增字段 ${newFields}、新增行 ${newRows}、待分类 ${pendingRows}、冲突 ${conflicts}。`);
          return;
        }
        commitCrawlMerge(profile, session, { lockImported: true });
        await saveProfile(profile);
        setPanelStatus(`已合并并锁定新增字段 ${newFields} 项、表格行 ${newRows} 行；${pendingRows} 行进入待分类，${conflicts} 个冲突保留原值。`);
      } catch (error) {
        setPanelStatus(`提取已停止：${error instanceof Error ? error.message : '请刷新页面后重试'}`);
      }
    } else if (act === 'sessioncrawl') {
      if (activeCrawlController) {
        activeCrawlController.abort();
        activeCrawlController = null;
        setPanelBusy(false);
        setPanelStatus('正在取消会话爬取…');
        return;
      }
      const crawlController = new AbortController();
      setPanelBusy(true);
      activeCrawlController = crawlController;
      try {
        const adapterPackage = resolveAdapterForFill(location.href);
        if (!adapterPackage) throw new Error('当前站点没有声明式适配包');
        if (adapterPackage.crawl.mode !== 'session' || (!adapterPackage.crawl.readOnlyPaths?.length && !adapterPackage.crawl.discoveredPages?.length)) throw new Error('该项目未声明可读取的只读页面；请逐页使用“从本页提取档案”');
        setPanelStatus('正在读取白名单内的只读页面；再次点击“登录后会话爬取”可取消…');
        const result = await crawlDeclaredReadOnlyPages(adapterPackage, location.href, fetch, { signal: crawlController.signal, timeoutMs: 12000, minIntervalMs: 350, currentDocument: document });
        const incomplete = crawlCompletionFailures(adapterPackage, result);
        if (incomplete.length) {
          const pageNames = new Map(adapterPackage.pages.map((pageItem) => [pageItem.id, pageItem.name]));
          const details = incomplete.map((item) => `${pageNames.get(item.path) || item.path}：${item.reason}`).join('\n');
          window.alert(`会话爬取未完成，未写入个人档案。结果已脱敏暂存，可排查后重试。\n\n${details}`);
          setPanelStatus(`会话爬取未完成：${incomplete.length} 个栏目失败，未合并档案。`);
          return;
        }
        const profile = await loadProfile();
        const preview = previewCrawlMerge(profile, result.session);
        const newFields = preview.items.filter((x) => x.kind === 'new').length;
        const conflicts = preview.items.filter((x) => x.kind === 'conflict' || x.kind === 'locked').length;
        const newRows = Object.values(preview.newRows).reduce((n, rows) => n + (rows?.length || 0), 0);
        const pendingRows = preview.pendingClassifications.length;
        if (!window.confirm(`会话爬取完成：成功读取 ${result.fetched} 页，失败 ${result.failures.length} 页。\n新增字段 ${newFields}，新增表格行 ${newRows}，待分类 ${pendingRows}，冲突/锁定 ${conflicts}。\n\n确认后只合并新增内容并锁定。`)) {
          setPanelStatus('会话爬取结果已暂存，尚未合并到档案。');
          return;
        }
        commitCrawlMerge(profile, result.session, { lockImported: true });
        await saveProfile(profile);
        setPanelStatus(`会话爬取已合并：${newFields} 个字段、${newRows} 行；冲突未覆盖。`);
      } catch (error) {
        setPanelStatus(`会话爬取已停止：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (activeCrawlController === crawlController) activeCrawlController = null;
        setPanelBusy(false);
      }
    } else if (act === 'copymissing') {
      if (!lastResult) {
        setPanelStatus('请先点击「一键填充」');
        return;
      }
      try {
        const profile = await loadProfile();
        const ok = await copyText(buildMissingText(lastResult, profile));
        setPanelStatus(ok ? '漏填项已复制到剪贴板' : '复制失败，请手动处理');
      } catch {
        setPanelStatus('读取档案失败，请刷新页面重试');
      }
    } else if (act === 'copyreport') {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'PANEL_REPORT' });
        if (!resp || !resp.ok) {
          setPanelStatus('字段报告生成失败，请刷新页面重试');
          return;
        }
        const full = {
          url: (() => { try { const u = new URL(location.href); return `${u.origin}${u.pathname}`; } catch { return ''; } })(),
          title: document.title,
          adapter: matchAdapter(location.href, adapters) ? matchAdapter(location.href, adapters)!.id : null,
          adapterPackage: resolveAdapterForFill(location.href)?.id || null,
          frames: resp.reports || [],
        };
        const ok = await copyText(JSON.stringify(full, null, 2));
        setPanelStatus(ok ? '字段报告已复制（含所有子框架），可粘贴反馈给开发者' : '复制失败');
      } catch {
        setPanelStatus('字段报告生成失败，请刷新页面重试');
      }
    } else if (act === 'clearfill') {
      const answer = window.confirm('清除本页已填：将清空本扩展在本页自动填写的字段值（您手动填写的内容不受影响，也不会改动服务器已保存的数据）。继续吗？');
      if (!answer) return;
      destroyPickerRun();
      const cleared = clearPageFill(document);
      closeCheckReport();
      setPanelStatus(cleared ? `已清除本页自动填写的 ${cleared} 个字段；可重新调整档案后再填充` : '本页没有本扩展自动填写的字段');
      showToast(cleared ? `已清除本页自动填写的 ${cleared} 个字段（手动填写的内容未动）` : '本页没有本扩展自动填写的字段', { tone: 'info' });
      try {
        sessionStorage.removeItem(REFILL_KEY); // 清除后停止自动补填，避免马上把值写回去
        sessionStorage.removeItem(PROGRESS_KEY);
      } catch {
        // 忽略
      }
      fillFinished = true;
    } else if (act === 'clear') {
      destroyPickerRun();
      clearHighlights(document);
      closeCheckReport();
      try {
        sessionStorage.removeItem(REFILL_KEY); // 停止自动补填
        sessionStorage.removeItem(PROGRESS_KEY);
      } catch {
        // 忽略
      }
      fillFinished = true;
      if (fillBanner) {
        fillBanner.remove();
        fillBanner = null;
      }
      setPanelStatus('已清除高亮标记（并停止自动补填）');
    }
  },
};

if (isTop) {
  initPanel(handlers);
  renderPanelTelemetry(telemetryState);
  // 页面跳转/回发前立即释放接管卡片和轮询；新文档会创建全新的 content-script 实例。
  window.addEventListener('pagehide', () => {
    destroyPickerRun();
  }, { once: true });
  try {
    sessionStorage.removeItem('tui-pb-fired'); // 新文档已载入：上一文档的卸载信号作废，避免阻断本页自动加行
    // 弹窗失败计数只在单页生命周期内有效：每次页面载入都给选择器全新机会（旧版本失败不得拖累新版本；成熟填表软件同款——失败防护不跨会话）
    sessionStorage.removeItem('tui-pick-fails');
    sessionStorage.removeItem('tui-pick-rounds');
  } catch {
    // 忽略
  }
  const url = location.href;
  const fields = detect();
  const matched = fields.filter((f) => f.rule).length;
  if (matchAdapter(url, adapters)?.autoShow || AUTO_SHOW_PATTERN.test(url) || (fields.length >= 12 && matched >= 5)) {
    showPanel();
  }
  // 恢复未完成的自动加行任务（页面整页刷新后继续），并补回可能被失败回发清空的基本字段
  void (async () => {
    try {
      // 旧键中的任务可能包含自动保存动作，升级后只清理一次，不影响新版安全加行任务。
      sessionStorage.removeItem(LEGACY_RESUME_KEY);
    } catch {
      // 忽略
    }
    if (readRowJobs().length) {
      restoreProgressBanner();
      // G04:回发恢复自成一轮(明确启动时捕获快照并重新读取资料)。
      const ctx = captureRunSnapshot(document, location.href, makeRunId());
      activeRunSnapshot = ctx;
      activeRunId = ctx.runId;
      const profile = profileForCurrentPage(await loadProfile());
      setPanelStatus('🔄 正在继续未完成的表格自动加行…');
      await processRowJobs(profile, ctx);
    } else {
      restoreProgressBanner(); // 回发刷新后恢复进度条显示（行任务刚起步或延时补填中）
    }
  })();
  // 保存回发后恢复：本标签页内曾一键填充过（同 URL）→ 每次页面刷新后自动补填被清空的字段
  const refillUrl = (() => {
    try {
      return sessionStorage.getItem(REFILL_KEY);
    } catch {
      return null;
    }
  })();
  if (refillUrl && refillUrl === location.href) {
    restoreProgressBanner(); // 保存回发刷新：先恢复进度条，随后补填轮次再更新
    void loadProfile().then((profile) => {
      setPanelStatus('🔄 检测到保存后页面刷新：正在恢复被清空的字段…');
      // 假保存比对：填写过的表格在保存回发后内容全空 → 明确告警（"接口成功但刷新整表空=毁档"同款教训）。
      // 手动删除过内容属于误报，文案中已说明可忽略。
      const beforeEvidence = readTableEvidence();
      const fakeKind = beforeEvidence.length ? detectFakeSave(beforeEvidence, document, routeKeyFor(location.href)) : null;
      if (fakeKind && !sessionStorage.getItem('tui-fake-save-warned')) {
        try {
          sessionStorage.setItem('tui-fake-save-warned', '1');
        } catch {
          // 忽略
        }
        setPanelStatus(`⚠️ 上次保存可能未生效：${rowJobLabel(fakeKind)}表格在保存后为空。若非你手动删除，请重新填写并再次保存`);
        showToast(`🔴 疑似假保存：${rowJobLabel(fakeKind)}表格在保存后内容为空。请核对页面，必要时重新填写并再次保存（若是你手动删除可忽略）`, { tone: 'error', duration: 15000 });
        emitTelemetry({
          stage: 'failed',
          level: 'error',
          action: '检测到疑似未生效的保存',
          reason: `${rowJobLabel(fakeKind)}表格在保存回发后内容为空；请核对页面，必要时重新填写并保存`,
          recoverable: true,
        });
      }
      scheduleRestorePasses(profileForCurrentPage(profile));
    });
  }
  // 调试钩子：?tui-autotest=1 用本地档案自动填充；?tui-autotest=2 用随机测试档案填充（供自动化测试与商店截图）
  if (/[?&]tui-autotest=[12]/.test(location.search)) {
    const run = async (rawProfile: Profile) => {
      const profile = profileForCurrentPage(rawProfile);
      const ctx = captureRunSnapshot(document, location.href, makeRunId());
      activeRunSnapshot = ctx;
      activeRunId = ctx.runId;
      const res = await fillCurrentDocument(profile, true, true, ctx);
      if (!runStillActive(ctx)) return;
      const marker = document.createElement('div');
      marker.id = 'tui-autotest-result';
      marker.textContent = JSON.stringify({ ...res.stats, extId: chrome.runtime.id || '' });
      (document.body || document.documentElement).appendChild(marker);
      void (async () => {
        const a = await fillAchievements(profile, document);
        const x = await fillExperiences(profile, document);
        if (a > 0 || x > 0) marker.textContent = JSON.stringify({ ...res.stats, achievements: a, experiences: x, extId: chrome.runtime.id || '' });
      })();
    };
    if (/[?&]tui-autotest=2/.test(location.search)) run(generateTestProfile());
    else void loadProfile().then(run);
  }
}

// 同源/跨域子框架若因“新增一行”的服务器回发而单独刷新，也要在自己的页面继续任务。
if (!isTop && readRowJobs().length) {
  const childCtx = captureRunSnapshot(document, location.href, makeRunId());
  activeRunSnapshot = childCtx;
  activeRunId = childCtx.runId;
  void loadProfile()
    .then((profile) => processRowJobs(profileForCurrentPage(profile), childCtx))
    .catch(() => writeRowJobs([]));
}

chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: any): boolean => {
  switch (msg && msg.type) {
    case 'FILL': {
      // 日历等工具 iframe（几乎没有可匹配字段）不执行填充，避免覆盖主页面诊断数据
      if (window !== window.top && detect().filter((f) => f.rule).length < 3) return false;
      // J00:新轮替换旧轮——先让上一轮立即失效(停回调/清 pending/报 cancelled),再登记本轮。
      if (activeRunId && activeRunId !== (typeof msg.runId === 'string' ? msg.runId : activeRunId)) {
        cancelActiveRun('superseded-by-new-run');
      }
      // P05:拍摄本轮快照;旧轮异步结果(迟到消息/恢复回调)在 runStillActive() 处被拒。
      const fillPkg = resolveAdapterForFill(location.href);
      activeRunSnapshot = captureRunSnapshot(document, location.href, typeof msg.runId === 'string' ? msg.runId : undefined, fillPkg ? { id: fillPkg.id, version: fillPkg.version } : undefined);
      activeRunId = activeRunSnapshot.runId;
      const fillCtx = activeRunSnapshot;
      markRunLifecycle(fillCtx.runId, 'active'); // J00:本轮显式进入 active
      terminalSentRunId = ''; // J00:新轮重新允许发送一次终态
      // G05:先向后台注册本 frame/文档为参与者(终态协议的前提)。
      try {
        void chrome.runtime.sendMessage({ type: 'FILL_REGISTER', runId: activeRunId, docId: documentIdentity(document) });
      } catch {
        // 后台不存在时忽略
      }
      try {
        beginPickerRun();
        // 先读一遍页面架构再操作（网格/加行按钮/弹窗结构），供适配逻辑与后续诊断
        sessionStorage.setItem('tui-site-scan', JSON.stringify(sanitizeScanForDiagnostics(scanSite(document)))); // I02:不落页面原文
        // 每次用户主动点「一键填充」都重置弹窗失败计数：上一轮失败不应让新一轮直接跳过。
        sessionStorage.removeItem('tui-pick-fails');
        sessionStorage.removeItem('tui-pick-rounds');
        // 清除过期回发信号：上一次导航的 pagehide 时间戳不得让本轮点击被"回发刚发生"误拦 8 秒
        sessionStorage.removeItem('tui-pb-fired');
        // 新一轮填写开始：上一次的假保存告警清零（本页再次保存时会重新比对）
        sessionStorage.removeItem('tui-fake-save-warned');
      } catch {
        // 忽略
      }
      loadProfile()
        .then(async (rawProfile) => {
          if (!runStillActive(fillCtx)) { sendResponse({ ok: false, reason: 'cancelled' }); return; }
          const profile = profileForCurrentPage(rawProfile);
          if (isTop) {
            fillFinished = false;
            setFillProgress(2, '⚡ 正在扫描页面并填充', '请稍候…');
          }
          const initialResult = await fillCurrentDocument(profile, true, true, fillCtx);
          if (!runStillActive(fillCtx)) { sendResponse({ ok: false, reason: 'cancelled' }); return; }
          lastResult = initialResult;
          lastResultRunId = fillCtx.runId;
          if (isTop) {
            const t = lastResult.stats.total || 1;
            const done = lastResult.stats.filled + lastResult.stats.skipped + lastResult.stats.failed;
            setFillProgress(8 + Math.round(30 * Math.min(1, done / t)), '⚡ 常规字段填充', `已填 ${lastResult.stats.filled} 项 / 共 ${lastResult.stats.total} 项`);
          }
          try {
            sessionStorage.setItem(REFILL_KEY, location.href); // 之后每次保存回发刷新都自动补填
          } catch {
            // 忽略
          }
          scheduleCascadeRetries(lastResult.items, lastResult.stats, activeRunSnapshot);
          // 常规字段先落入当前空行，再按“点击新增 → 等待可见行增长 → 填下一条”的顺序续填。
          startSafeRowJobs(profile, activeRunSnapshot);
          scheduleSettleChecks(lastResult.items, lastResult.stats, activeRunSnapshot);
          const finalStats = lastResult.stats; // 闭包内引用快照，避免 TS 无法收窄 lastResult 非空
          // 仅在仍有异步工作时补填：稳定页面不再无条件等待并重复扫描 6.5/12/20/30 秒。
          const followupDelays = [2500, 7000, 15000];
          const myRunId = activeRunId;
          const mySnapshot = activeRunSnapshot;
          followupDelays.forEach((delay, idx) =>
            setTimeout(async () => {
              if (manuallyPausedRunId === myRunId) return; // 暂停期间禁止定时补填绕过后台恢复确认。
              if (terminalSentRunId === myRunId) return; // 终态即最终：取消尚未开始的补填回调。
              if (!runStillActive(mySnapshot) || activeRunId !== myRunId) return; // J00:含生命周期(取消/超时后补填轮不再启动)
              if (!hasDeferredFillWork() && idx < followupDelays.length - 1) return;
              let unstableCount = 0;
              const roundRes = await fillCurrentDocument(profile, false, false, mySnapshot);
              if (!runStillActive(mySnapshot)) return;
              writeTableEvidence(document);
              // G06:补填轮次同样注册 settle 收口(必须携带原轮 ctx,否则守卫会拒绝执行)。
              scheduleSettleChecks(roundRes.items, roundRes.stats, mySnapshot);
              // P06:末轮补填后做稳定校正——本轮写入但页面未稳定接受(框架重置等)的 filled 项转 failed 并标红。
              if (idx === followupDelays.length - 1) {
                lastResult = roundRes;
                lastResultRunId = myRunId || '';
                // I00:末轮稳定验证窗口结束后由"工作集合归零"发终态(不能把尚未验证的写入当最终结果)。
                scheduleTerminalWhenIdle(mySnapshot?.runId || myRunId || '');
                const corr = stableVerifyWritten(roundRes.items, (el) => getOwnedValue(document, el), (el) => readableControlValue(el));
                for (const it of corr) {
                  it.status = 'failed';
                  const el = it.el;
                  let verdict: 'restored' | 'alreadyRestored' | 'restoreFailed' | 'notAttempted' = 'notAttempted';
                  if (el && el.isConnected) verdict = conditionalRestore(document, el, mySnapshot);
                  it.reason = verdict === 'restored'
                    ? '稳定回读失败后已按驱动策略恢复写前原值'
                    : verdict === 'alreadyRestored'
                      ? '稳定回读失败:页面已回到写前原值(无需恢复)'
                      : verdict === 'restoreFailed'
                        ? '稳定回读失败且恢复原值失败,请人工核对'
                        : '稳定回读失败:来源不确定或驱动不可逆,未自动恢复,请人工处理';
                  if (el && verdict === 'restored') {
                    el.classList.remove('tui-filled', 'tui-missing', 'tui-empty');
                    el.removeAttribute('data-tui');
                  } else if (el) {
                    markEl(el, 'missing');
                  }
                }
                unstableCount = corr.length;
              }
              if (isTop) {
                if (pickersDepth > 0) setFillProgress(98, '🔁 自动选择弹窗仍在进行', '请稍候，不要手动关闭弹窗…');
                else if (readRowJobs().length || rowJobsRunning) setFillProgress(99, '🔁 自动加行仍在进行', '表格行尚未全部添加，稍后自动继续');
                else if (idx < followupDelays.length - 1 && hasDeferredFillWork()) setFillProgress(96 + idx, '🔁 自动补填进行中…', '检测到异步控件，等待页面完成渲染');
                else finishFillBanner(unstableCount > 0 ? `填充完成：${unstableCount} 项未稳定接受（已标红）` : `填充完成：已填 ${finalStats.filled} 项`, unstableCount > 0 ? '请人工核对红色高亮项' : '请核对绿色高亮后保存', myRunId);
              }
            }, delay),
          );
          // 安全加行任务只点击明确的“新增一行”；保存、下一步与提交仍由用户完成。
          /** 功能:J01 统一发布出口——result=进度,terminal=终态,pause=等待人工的可恢复暂停。 */
          const publishResult = (kind: 'result' | 'terminal' | 'pause'): void => {
            if (!lastResult || !runStillActive(fillCtx)) return;
            if (kind === 'pause' && manuallyPausedRunId === fillCtx.runId) return;
            if (kind === 'pause') manuallyPausedRunId = fillCtx.runId;
            const isTerminal = kind === 'terminal';
            // J00:取消/超时后不得再发"成功"终态(该轮的取消终态已由 deactivateRun 上报)。
            if ((isTerminal || kind === 'pause') && runLifecycleOf(fillCtx.runId) !== 'active') return;
            if (isTerminal && !markTerminalSent(fillCtx.runId)) return; // I00:每轮只发一次终态
            try {
              // G05:DTO 白名单构造(valuePreview/pickerContext/expectedCode/el 一律不进入消息)
              const plainItems = lastResult.items.map((item) => toPlainFillItem(item));
              const delivery = chrome.runtime.sendMessage({
                type: kind === 'terminal' ? 'FILL_TERMINAL' : kind === 'pause' ? 'FILL_PAUSE' : 'FILL_RESULT',
                runId: fillCtx.runId,
                docId: documentIdentity(document),
                frameSeq: nextFrameSeq(),
                stats: lastResult.stats,
                items: plainItems,
                // H03/J01:等待人工接管以"可恢复暂停"上报,不得按普通完成上报、也不冻结成终态。
                ...(isTerminal ? { terminalKind: terminalKindForFrame() } : {}),
                ...(kind === 'pause' ? { pauseReason: 'manual' } : {}),
              });
              void delivery.then((response) => {
                if (kind === 'pause' && runStillActive(fillCtx) && (response?.ok !== true || response.runId !== fillCtx.runId)) deactivateRun(fillCtx.runId, 'cancelled', 'pause-rejected');
              }).catch(() => {
                if (kind === 'pause' && runStillActive(fillCtx)) deactivateRun(fillCtx.runId, 'cancelled', 'pause-unavailable');
              });
            } catch {
              // 后台不存在时忽略
            }
          };
          const sendResult = (terminal: boolean): void => {
            // J01:仅剩人工接管 → 上报"暂停"(轮次保留),等人工完成后由 FILL_RESUME 续轮并重新汇总。
            if (terminal && terminalKindForFrame() === 'waiting-manual') {
              publishResult('pause');
              return;
            }
            publishResult(terminal ? 'terminal' : 'result');
          };
          sendResult(false);
          // G05:本帧结果产生即写本地日志/面板(不依赖后台 FILL_DONE;汇总到达时再更新总数)。
          if (isTop) {
            recordFillResultTelemetry(lastResult.items, lastResult.stats);
            setPanelStatus(formatStats(lastResult.stats));
          }
          // G05:无异步工作时,等 settle 收口后立即终态;有异步工作时由末轮补填回调发终态。
          // I00:终态改由"工作集合归零"驱动(依赖/picker/行任务/日期组件/settle),不再用固定延时冒充工作结束。
          sendTerminalNow = () => sendResult(true);
          cascadeWatch = Array.from(document.querySelectorAll<HTMLSelectElement>('select')).filter((el) => !el.value && el.options.length <= 1 && !el.disabled);
          scheduleTerminalWhenIdle(fillCtx.runId); // settle已登记，按真实工作状态检查，不用attempt值伪造等待时间。
          sendResponse({ ok: true, stats: lastResult.stats });
        })
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    case 'FILL_STOP': {
      // J00:后台 deadline 到点 → 本轮 scoped 停止;已写值保留,不自动撤销用户数据。
      if (typeof msg.runId !== 'string' || !msg.runId) return false;
      if (!activeRunId || msg.runId !== activeRunId) return false; // 只停本轮,不碰新轮
      if (msg.docId !== documentIdentity(document)) return false; // 同frame旧文档的停止不能作用于新文档。
      deactivateRun(msg.runId, 'expired', typeof msg.reason === 'string' ? msg.reason : 'deadline');
      if (isTop) {
        const manualTimeout = msg.reason === 'manual-timeout';
        setPanelStatus(manualTimeout ? '⚠️ 人工接管等待已到期，本轮已停止；已填内容保留' : '⚠️ 填写超时:本轮已停止(已填内容保留),请核对后重新点击「一键填充」');
        finishFillBanner(manualTimeout ? '人工接管等待已到期' : '填写超时已停止', '已写内容保留;未完成字段请重新一键填充');
      }
      return false;
    }
    case 'FILL_LATE_REGISTRATION': {
      // I00:本区域在收口后才注册 → 明确告知未计入本轮,不静默。
      if (isTop && typeof msg.message === 'string') setPanelStatus(`⚠️ ${msg.message}`);
      return false;
    }
    case 'FILL_ROUND_NOTICE': {
      // I00:顶层可见的跨 frame 边界提示(收口后晚注册区域数,按区域去重计数)。
      if (isTop && typeof msg.message === 'string') {
        setPanelStatus(`⚠️ ${msg.message}`);
        finishFillBanner('本轮有未覆盖区域', msg.message);
      }
      return false;
    }
    case 'REPORT':
      try {
        void chrome.runtime.sendMessage({ type: 'REPORT_RESULT', report: buildReport() });
        sendResponse({ ok: true });
      } catch {
        sendResponse({ ok: false });
      }
      return false;
    case 'FILL_DONE': {
      if (typeof msg.runId !== 'string' || !activeRunId || msg.runId !== activeRunId) return false;
      if (msg.timedOut === true && isTop) {
        const missing = Array.isArray(msg.missing) ? msg.missing.length : 0;
        recordFillResultTelemetry(msg.items || [], msg.stats);
        const manualTimeout = msg.finishReason === 'manual-timeout';
        setPanelStatus(manualTimeout ? `⚠️ 人工接管等待已到期：${missing} 个区域仍待处理` : `⚠️ 填充未完成：${missing} 个已登记区域尚未返回终态，请核对页面后重试`);
        finishFillBanner(manualTimeout ? '人工接管等待已到期' : '填充未完成(部分区域超时)', `${missing} 个区域未完成，请核对后重试`);
        return false;
      }
      if (isTop) {
        // F06:收口前做确定性 settle 复验(不受后台定时器节流影响)。
        // H04:本轮所有尚未收口的 settle 一并复验并标记已处理,避免多阶段验证被覆盖丢失或重复计数。
        const pendingSettles = settleRegistry.consumeRun(activeRunId || '');
        for (const run of pendingSettles) run.failed += runSettleOnce(run.items, run.stats as FillStats, run.ctx);
        const failedSettle = pendingSettles.filter((run) => run.failed > 0).pop();
        // G05:顶层保留本地执行记录(items/元素引用),只把汇总统计用于展示——
        // 后台 DTO 不得替换本地 registry(否则稳定校正/清除会失去元素与预期值)。
        if (!lastResult) {
          lastResult = { stats: msg.stats, items: msg.items || [] };
        } else if (failedSettle) {
          const failedStats = failedSettle.stats as FillStats;
          lastResult.stats.filled = failedStats.filled;
          lastResult.stats.failed = failedStats.failed;
        }
        // 展示后台的跨 frame 摘要；本地 lastResult 继续保留元素引用，不能用它冒充全页汇总。
        recordFillResultTelemetry(msg.items || [], msg.stats);
        // H03.3:跨 frame 边界必须可见——等待人工/未响应/收口后晚注册都不得静默。
        const boundaryNotes: string[] = [];
        const kinds = (msg.terminalKinds || {}) as Record<string, number>;
        if ((kinds['waiting-manual'] || 0) > 0) boundaryNotes.push(`${kinds['waiting-manual']} 个区域等待人工接管`);
        if ((kinds['cancelled'] || 0) > 0) boundaryNotes.push(`${kinds['cancelled']} 个区域已取消`);
        if (Array.isArray(msg.missing) && msg.missing.length > 0) boundaryNotes.push(`${msg.missing.length} 个区域未响应(未计入汇总)`);
        if (typeof msg.lateRegistrations === 'number' && msg.lateRegistrations > 0) boundaryNotes.push(`${msg.lateRegistrations} 个区域在注册窗口后加入`);
        setPanelStatus(formatStats(msg.stats) + (boundaryNotes.length ? `；${boundaryNotes.join('；')}` : ''));
      }
      sendResponse({ ok: true });
      return false;
    }
    default:
      return false;
  }
});

// 验证码 OCR 辅助：可选功能，启动时检查用户设置；默认关闭时无任何副作用
if (typeof window !== 'undefined' && isTop) {
  // 异步启动，不阻塞主流程
  void startCaptchaAssistant().catch((e) => console.warn('[tui-captcha] 启动失败：', e));
}

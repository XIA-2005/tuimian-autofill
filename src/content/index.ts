// 内容脚本入口：每个 frame 运行一份。顶层 frame 负责悬浮面板、自动填充与消息协调。

import { Profile } from '../core/profile';
import { loadProfile, saveProfile } from '../core/storage';
import { generateTestProfile } from '../core/testdata';
import { importFromPage } from '../core/importer';
import { addSnapshot, applicationChoicesFromPage, captureCurrentPage, commitCrawlMerge, crawlCompletionFailures, crawlDeclaredReadOnlyPages, loadCrawlSession, previewCrawlMerge, rememberApplicationChoice, saveCrawlSession } from '../core/crawl';
import { scanSite } from '../core/scanner';
import { runPreSubmitCheck } from '../core/checker';
import { loadRemoteRules } from '../core/rulesync';
import { DetectedField, detectAllFields, FIELD_RULES, FieldRule, probeComponentDropdowns } from '../core/matcher';
import { clearHighlights, clearPageFill, closeLeftoverPickers, directFillRegionTriplets, fillAchievements, fillAll, fillAwardRows, fillExperiences, fillFamilyMembers, fillLanguageExams, FillItem, FillResult, FillStats, findAchievementTable, findAwardTable, findExperienceTable, findFamilyTable, findLanguageTable, languageExamEntryCount, markEl, pickInPage, sleep, snapshotFillState, trySetSelect, visibleDialogRoots } from '../core/filler';
import { ISSUE_CATALOG, issueMeta } from '../core/error-codes';
import { ADAPTERS, AUTO_SHOW_PATTERN, allAdapters, extraRulesFor, matchAdapter, PlatformAdapter } from '../core/adapters';
import { matchAdapterPackage, matchAdapterPage, SCHOOL_ADAPTER_PACKAGES } from '../core/adapter-packages';
import { SCHOOLS_WITH_PROGRAMS } from '../core/school-programs';
import { projectProfile } from '../core/projection';
import { fillAdapterContract } from '../core/control-drivers';
import { fillDateControlAsync } from '../core/date-drivers';
import { decideRowJobRound, nextRowJobIndex, ROW_JOB_FAIL_CAP } from '../core/row-job-progress';
import { detectFakeSave, snapshotTableEvidence, TableEvidence } from '../core/save-guard';
import { applyFillTelemetryCounts, createFillTelemetryState, FillTelemetryEventInput, FillTelemetryStage, FillTelemetryState, reduceFillTelemetry, restoreFillTelemetryState } from '../core/fill-telemetry';
import { initPanel, PanelHandlers, renderPanelTelemetry, setPanelBusy, setPanelStatus, showPanel, showToast } from './panel';
import { startCaptchaAssistant } from './captcha-orchestrator';
import { isPickerManual, markPickerDone, markPickerFailed, markPickerManual } from '../core/picker-state-machine';
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
  const adapterPackage = matchAdapterPackage(location.href, adapterPackages);
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

/** 完成态：100% 绿色，短暂停留后自动收起；此后本页延时轮次不再弹出横幅。弹窗点选进行中不宣告完成 */
function finishFillBanner(summary: string, sub?: string): void {
  if (!isTop || fillFinished || pickersDepth > 0) return;
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
function fillCurrentDocument(profile: Profile, resetPickerAttempts = false): FillResult {
  const adapterPackage = matchAdapterPackage(location.href, adapterPackages);
  const contractItems = fillAdapterContract(profile, document, location.href, adapterPackage);
  const result = fillAll(profile, document, activeRules, {
    resetPickerAttempts,
  });
  for (const item of contractItems) {
    if (item.status !== 'skipped' || !item.el || !item.pickerContext || result.items.some((existing) => existing.el === item.el && existing.status === 'picker')) continue;
    result.items.push({
      label: item.profilePath,
      field: item.profilePath,
      status: 'picker',
      reason: item.reason,
      valuePreview: item.valuePreview,
      el: item.el,
      pickerContext: item.pickerContext,
    });
    result.stats.total += 1;
    result.stats.picker += 1;
  }
  return result;
}
let lastResult: FillResult | null = null;

/** 功能：把普通字段填充结果批量写入实时日志；不写 valuePreview，避免泄露档案真实值。 */
function recordFillResultTelemetry(items: FillItem[], stats: FillStats): void {
  if (!isTop) return;
  const statusText: Record<FillItem['status'], { level: 'info' | 'success' | 'warning' | 'error'; action: string }> = {
    filled: { level: 'success', action: '已填写并回读通过' },
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
  telemetryState = applyFillTelemetryCounts(telemetryState, {
    total: stats.total,
    filled: stats.filled,
    skipped: stats.skipped + stats.noMatch,
    failed: stats.failed,
    waiting: stats.profileEmpty + stats.picker,
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
function buildReport(): string {
  const fields = detect();
  const safeUrl = (() => { try { const u = new URL(location.href); return `${u.origin}${u.pathname}`; } catch { return ''; } })();
  const fillSummary = (() => {
    try {
      const raw = sessionStorage.getItem('tui-fill-summary');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed ? { at: parsed.at, stats: parsed.stats, items: Array.isArray(parsed.items) ? parsed.items.map((item: any) => ({ label: item.label, field: item.field, status: item.status, reason: item.reason || '', issue: item.issue || '' })) : [] } : null;
    } catch { return null; }
  })();
  const siteStructure = scanSite(document);
  siteStructure.url = safeUrl;
  siteStructure.gridTables.forEach((table) => { table.samples = []; });
    return JSON.stringify(
      {
        url: safeUrl,
        title: document.title,
        adapter: matchAdapter(location.href, adapters) ? matchAdapter(location.href, adapters)!.id : null,
        adapterPackage: matchAdapterPackage(location.href, adapterPackages)?.id || null,
        // 稳定问题码目录：报告中 items.issue 可直接对照"用户该做什么"
        issueCatalog: ISSUE_CATALOG,
        // 只保留状态和字段名，不包含档案值、姓名、证件、电话、邮箱或真实表格内容。
        fillSummary,
      // 弹窗点选调试记录（trigger 命中/点击策略/是否弹出/最终结果）
      pickDebug: (() => {
        try {
          const raw = sessionStorage.getItem('tui-pick-debug');
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })(),
      // 行任务（自动加行）逐轮诊断：类型/进度/行数变化/异常
      rowJobsDebug: (() => {
        try {
          const raw = sessionStorage.getItem('tui-rowjobs-debug');
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })(),
      // 动作按钮点击诊断：被点元素签名（tag/id/class/disabled/onclick）+ 触发策略（"点了没反应"类问题定位用）
      clickDebug: (() => {
        try {
          const raw = sessionStorage.getItem('tui-click-debug');
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })(),
      // 加行按钮查找诊断：被跳过的候选及原因（disabled/other-table/own-ui）——定位"为什么没点到真按钮"
      addbtnDebug: (() => {
        try {
          const raw = sessionStorage.getItem('tui-addbtn-debug');
          return raw ? JSON.parse(raw) : null;
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
            return JSON.parse(raw);
          } catch {
            return raw;
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
      widgetProbe: probeComponentDropdowns(document),
      total: fields.length,
      fields: fields.map((f) => ({
        label: f.label,
        tag: f.el.tagName.toLowerCase(),
        type: f.el.getAttribute('type') || '',
        name: f.el.getAttribute('name') || '',
        id: f.el.id || '',
        readonly: f.readonly,
        hasPickerTrigger: !!f.pickerTrigger,
        matched: f.skip ? 'SKIP:' + f.skip : f.rule ? f.rule.field : 'NO_MATCH',
        options: f.el.tagName === 'SELECT' ? Array.from((f.el as HTMLSelectElement).options).map((o) => o.text).join(' | ').slice(0, 200) : '',
      })),
      tables: Array.from(document.querySelectorAll('table'))
        .slice(0, 20)
        .map((t) => {
          return {
            rows: t.rows.length,
            hasThead: !!t.querySelector('thead'),
            hasTbody: !!t.querySelector('tbody'),
            inputCount: t.querySelectorAll('input, select, textarea').length,
            headerCells: Array.from(t.rows[0] ? t.rows[0].cells : []).map((c) => (c.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)),
            dataRows: [],
          };
        }),
      buttons: Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], input[type="image"], span, i, div[role="button"]'))
        .slice(0, 80)
        .map((b) => ({
          tag: b.tagName.toLowerCase(),
          text: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
          value: (b.getAttribute('value') || '').slice(0, 24),
          alt: (b.getAttribute('alt') || '').slice(0, 24),
          cls: (b.getAttribute('class') || '').slice(0, 40),
          name: (b.getAttribute('name') || '').slice(0, 60),
          hrefKind: /^javascript:/i.test(b.getAttribute('href') || '') ? 'javascript' : b.hasAttribute('href') ? 'link' : '',
          disabled: !!(b as HTMLButtonElement).disabled,
          hasOnclick: b.hasAttribute('onclick'),
        }))
        .filter((b) => b.text || b.value || b.alt || /add|new|btn|insert|新增|添加|增加|保存|提交/i.test(b.cls + b.name)),
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

/** 联动下拉自动重试：目标选项一旦出现立即填充；仅在仍有未完成项时保留兜底轮次。 */
function scheduleCascadeRetries(items: FillItem[], stats?: FillStats): void {
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
  if (pendingNow) [450, 1200, 2400].forEach((delay) => setTimeout(retrySelects, delay));
  // 日期组件在 blur 后可能异步重置；用独立日期内核做第二阶段面板交互和完整回读。
  const dateItems = items.filter((it) => /^(basic\.birthday|education\.(startDate|endDate))$/.test(it.field || '') && it.valuePreview);
  if (dateItems.length) setTimeout(() => {
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
      void fillDateControlAsync(input, it.valuePreview, {
        precision: precision === 'year' || precision === 'month' || precision === 'day' ? precision : undefined,
        format: format === 'yyyy' || format === 'yyyyMM' || format === 'yyyy-MM' || format === 'yyyy/MM' || format === 'yyyy年MM月' || format === 'yyyyMMdd' || format === 'yyyy-MM-dd' || format === 'yyyy/MM/dd' || format === 'yyyy年MM月dd日' ? format : undefined,
        hiddenValueSelectors: readList('data-tui-date-model-selectors'),
        panelSelectors: readList('data-tui-date-panel-selectors'),
      }).then((result) => {
        it.status = result.ok ? 'filled' : 'failed';
        it.reason = result.reason;
        markEl(input, result.ok ? 'filled' : 'missing');
      });
    }
  }, 350);
  // 弹窗驱动本身带有 iframe/结果回读等待；先快速尝试，未完成时再保留 1200ms 兜底，减少稳定页面空等。
  setTimeout(() => void attemptPickers(items, stats), 80);
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
): void {
  clearPickerReleaseWait();
  const resume = (): void => {
    clearPickerReleaseWait();
    if (generation === pickerRunGeneration) void attemptPickers(items, stats);
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
): void {
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
  resumePickerQueueWhenSafe(items, stats, roots, generation);
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
      completeManualPicker(item, el, items, stats, roots, generation, 'automatic');
      return;
    }
    const visibleNow = new Set(visibleDialogRoots(document));
    const currentDialogStillOpen = roots.length
      ? roots.some((root) => root.isConnected && visibleNow.has(root))
      : visibleNow.size > 0;
    if (!currentDialogStillOpen) {
      clearPickerReleaseWait();
      void attemptPickers(items, stats);
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
    onComplete: (source) => completeManualPicker(item, el, items, stats, roots, generation, source),
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
      resumePickerQueueWhenSafe(items, stats, [], generation);
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
      waitForSkippedPickerRelease(item, el, items, stats, roots, generation);
    },
  });
}

/** 弹窗选择框自动点选一次（已填的不动，无法匹配的留给人工） */
async function attemptPickers(items: FillItem[], stats?: FillStats): Promise<void> {
  if (!isTop) return;
  // 全局互斥：多个延时补填轮次不得同时运行不同字段的弹窗任务。
  if (pickersDepth > 0 || activePick || pickerReleasePending || pickerHandoffController?.hasActiveTask()) return;
  pickersDepth += 1;
  let manualHint: string | null = null;
  try {
    manualHint = await attemptPickersInner(items, stats);
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
    else finishFillBanner('填充完成', '请核对绿色高亮后保存');
  }
}

async function attemptPickersInner(items: FillItem[], stats?: FillStats): Promise<string | null> {
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
  // 自愈：学校/专业"代码+名称"弹窗对的错位值（代号框被填了学校名、名称框被填了专业名等）→ 清空重走弹窗
  try {
    const pickerPairs = new Map<string, HTMLInputElement[]>();
    for (const it of items) {
      if (it.status !== 'picker' || !(it.el instanceof HTMLInputElement) || !document.documentElement.contains(it.el)) continue;
      const key = it.field || '';
      const list = pickerPairs.get(key) || [];
      list.push(it.el);
      pickerPairs.set(key, list);
    }
    for (const [, pair] of pickerPairs) {
      if (pair.length < 2) continue;
      // 代码框命名不一：txtBkzydm(专业码) / txtBkbydwm(学校码)，统一按 dm/bm/wm 结尾识别
      const codeInput = pair.find((i) => /(dm|bm|wm|cm)$/i.test(i.name || '') || /(dm|bm|wm|cm)$/i.test(i.id || ''));
      const nameInput = pair.find((i) => i !== codeInput);
      if (!codeInput || !nameInput) continue;
      const codeVal = (codeInput.value || '').trim();
      // 代号框应为纯数字编码；被填成文字（学校名/专业名错位）即清空成对框，随后走弹窗自动选择
      if (codeVal && !/^\d+$/.test(codeVal)) {
        codeInput.value = '';
        nameInput.value = '';
      }
    }
  } catch {
    // 忽略
  }
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
      res = await pickInPage(document, el, it.valuePreview || '', it.pickerContext);
    } finally {
      if (activePick && activePick.key === failKey) activePick = null;
    }
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
        if (isTop) handoffPicker(it, el, items, stats, handoffRoots, safeReason);
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

/** 保存回发后分多次补填（EasyUI 字段异步就绪需延时重试）；仅第一轮尝试自动点选弹窗字段 */
function scheduleRestorePasses(profile: Profile): void {
  const run = (attemptPickersToo: boolean) => {
    const res = fillCurrentDocument(profile);
    writeTableEvidence(document); // 补填后的表格状态是下一次保存的比对基线
    if (isTop && pickersDepth === 0) setFillProgress(93, '🔁 保存后自动补填', '恢复被回发清空的字段…');
    if (attemptPickersToo) scheduleCascadeRetries(res.items, res.stats);
  };
  setTimeout(() => run(true), 900);
  setTimeout(() => run(false), 2600);
  setTimeout(() => {
    run(false);
    if (isTop) {
      if (readRowJobs().length || rowJobsRunning) setFillProgress(96, '🔁 自动加行仍在进行', '补填完成，行任务继续…');
      else finishFillBanner('已恢复被清空的字段', '请核对后点保存');
    }
    setPanelStatus('🔄 已恢复被清空的字段，请核对后点保存');
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
function writeTableEvidence(doc: Document): void {
  try {
    sessionStorage.setItem('tui-table-evidence', JSON.stringify(snapshotTableEvidence(doc)));
  } catch {
    // 忽略
  }
}

function readTableEvidence(): TableEvidence[] {
  try {
    return JSON.parse(sessionStorage.getItem('tui-table-evidence') || '[]') as TableEvidence[];
  } catch {
    return [];
  }
}

// 行任务互斥：防止延时补填轮次与主流程并发重跑（重复点"添加"）；rerun 标记保证排队的新任务不丢失
let rowJobsRerun = false;

async function processRowJobs(profile: Profile): Promise<void> {
  if (!isTop) return;
  if (rowJobsRunning) {
    rowJobsRerun = true; // 已有流程在跑：结束后立即自动再跑一轮（第一遍点击常因回发刷新丢上下文而漏行）
    try {
      const dbg = JSON.parse(sessionStorage.getItem('tui-rowjobs-debug') || '[]');
      dbg.push({ at: Date.now(), type: 'queue', note: 'busy-rerun-flagged' });
      sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(dbg.slice(-20)));
    } catch {
      // 忽略
    }
    return;
  }
  rowJobsRunning = true;
  try {
    await processRowJobsInner(profile);
  } finally {
    rowJobsRunning = false;
    if (rowJobsRerun) {
      rowJobsRerun = false;
      void processRowJobs(profile);
    }
  }
}

async function processRowJobsInner(profile: Profile): Promise<void> {
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
    try {
      n =
        job.type === 'achievements'
          ? await fillAchievements(profile, document, job.startIndex, beforeAdd, addBudget, false, observeProcessed)
          : job.type === 'language'
            ? await fillLanguageExams(profile, document, job.startIndex, beforeAdd, addBudget, false)
          : job.type === 'family'
            ? await fillFamilyMembers(profile, document, job.startIndex, beforeAdd, addBudget, false, observeProcessed)
            : job.type === 'awards'
              ? await fillAwardRows(profile, document, job.startIndex, beforeAdd, addBudget, false, observeProcessed)
              : await fillExperiences(profile, document, job.startIndex, beforeAdd, addBudget, false, observeProcessed);
    } catch (e) {
      n = 0;
      try {
        const dbg = JSON.parse(sessionStorage.getItem('tui-rowjobs-debug') || '[]');
        dbg.push({ at: Date.now(), type: job.type, error: String((e as Error).message || e).slice(0, 60) });
        sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(dbg.slice(-20)));
      } catch {
        // 忽略
      }
    }
    const next = nextRowJobIndex(callStart, n, observedNextIndex);
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
        sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(dbg.slice(-20)));
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
        sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(dbg.slice(-20)));
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
      sessionStorage.setItem('tui-rowjobs-debug', JSON.stringify(dbg.slice(-20)));
    } catch {
      // 忽略
    }
    // 点过"添加/保存"后一律继续下一轮重试：原地加行成功→下一轮补下一条；
    // 整页刷新→由载入恢复接管；加行未生效→下一轮再点。不再空等，避免任务搁浅。
    continue;
  }
  if (isTop && !jobs.length) {
    setPanelStatus('表格自动加行填写完成 ✅（绿色高亮，请核对后保存）');
    finishFillBanner('表格自动加行填写完成', '绿色高亮，请核对后保存');
  } else {
    updateRowJobsProgress('🔄 正在自动加行');
  }
  snapshotFillState(document);
  writeTableEvidence(document);
  // 回发型页面：写完后定时补写（纯填充、不点按钮），防止网格重新渲染抹掉内容；网格异步渲染慢，末尾再补一轮
  void (async () => {
    await sleep(2500);
    await fillExperiences(profile, document, 0, undefined, 0);
    await fillFamilyMembers(profile, document, 0, undefined, 0);
    await sleep(2500);
    await fillAchievements(profile, document, 0, undefined, 0);
    await fillAwardRows(profile, document, 0, undefined, 0);
    await fillExperiences(profile, document, 0, undefined, 0);
    snapshotFillState(document);
    writeTableEvidence(document);
    await sleep(6000);
    await fillFamilyMembers(profile, document, 0, undefined, 0);
    await fillAwardRows(profile, document, 0, undefined, 0);
    snapshotFillState(document);
    writeTableEvidence(document);
  })();
}

/**
 * 为当前 frame 中实际存在的动态表建立任务。任务只允许点击“新增一行”，
 * 不允许借“保存/添加落库”换行，也不会点击下一步或提交。
 */
function startSafeRowJobs(profile: Profile): void {
  if (!isTop) return;
  const jobs: RowJob[] = [];
  if (findAchievementTable(document) && profile.research.some((row) => row.title?.trim())) jobs.push({ type: 'achievements', startIndex: 0, attempt: 0 });
  if (findAwardTable(document) && profile.awards.some((row) => row.content?.trim())) jobs.push({ type: 'awards', startIndex: 0, attempt: 0 });
  if (findExperienceTable(document) && profile.experiences.some((row) => row.org?.trim() || row.start?.trim())) jobs.push({ type: 'experiences', startIndex: 0, attempt: 0 });
  if (findFamilyTable(document) && profile.familyMembers.some((row) => row.name?.trim())) jobs.push({ type: 'family', startIndex: 0, attempt: 0 });
  if (findLanguageTable(document) && languageExamEntryCount(profile)) jobs.push({ type: 'language', startIndex: 0, attempt: 0 });
  writeRowJobs(jobs);
  if (jobs.length) void processRowJobs(profile);
}

const handlers: PanelHandlers = {
  onAction: async (act: string) => {
    if (act === 'fill') {
      setPanelBusy(true);
      beginFillTelemetry();
      setPanelStatus('⚡ 正在扫描页面并自动填写…');
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'PANEL_FILL' });
        if (resp && resp.ok) setPanelStatus(formatStats(resp.stats));
        else {
          emitTelemetry({ stage: 'failed', level: 'error', action: '无法开始填写', reason: '请确认已登录并停留在报名填表页', recoverable: true });
        setPanelBusy(false);
          setPanelStatus('填充失败：请确认已登录并停留在报名填表页');
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
        const adapterPackage = matchAdapterPackage(location.href, adapterPackages);
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
        const adapterPackage = matchAdapterPackage(location.href, adapterPackages);
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
          adapterPackage: matchAdapterPackage(location.href, adapterPackages)?.id || null,
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
      const profile = profileForCurrentPage(await loadProfile());
      setPanelStatus('🔄 正在继续未完成的表格自动加行…');
      await processRowJobs(profile);
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
      const fakeKind = beforeEvidence.length ? detectFakeSave(beforeEvidence, document) : null;
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
    const run = (rawProfile: Profile) => {
      const profile = profileForCurrentPage(rawProfile);
      const res = fillCurrentDocument(profile, true);
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
  void loadProfile()
    .then((profile) => processRowJobs(profileForCurrentPage(profile)))
    .catch(() => writeRowJobs([]));
}

chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: any): boolean => {
  switch (msg && msg.type) {
    case 'FILL': {
      // 日历等工具 iframe（几乎没有可匹配字段）不执行填充，避免覆盖主页面诊断数据
      if (window !== window.top && detect().filter((f) => f.rule).length < 3) return false;
      try {
        beginPickerRun();
        // 先读一遍页面架构再操作（网格/加行按钮/弹窗结构），供适配逻辑与后续诊断
        sessionStorage.setItem('tui-site-scan', JSON.stringify(scanSite(document)));
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
        .then((rawProfile) => {
          const profile = profileForCurrentPage(rawProfile);
          if (isTop) {
            fillFinished = false;
            setFillProgress(2, '⚡ 正在扫描页面并填充', '请稍候…');
          }
          lastResult = fillCurrentDocument(profile, true);
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
          scheduleCascadeRetries(lastResult.items, lastResult.stats);
          // 常规字段先落入当前空行，再按“点击新增 → 等待可见行增长 → 填下一条”的顺序续填。
          startSafeRowJobs(profile);
          const finalStats = lastResult.stats; // 闭包内引用快照，避免 TS 无法收窄 lastResult 非空
          // 仅在仍有异步工作时补填：稳定页面不再无条件等待并重复扫描 6.5/12/20/30 秒。
          const followupDelays = [2500, 7000, 15000];
          followupDelays.forEach((delay, idx) =>
            setTimeout(() => {
              if (!hasDeferredFillWork() && idx < followupDelays.length - 1) return;
              fillCurrentDocument(profile);
              writeTableEvidence(document);
              if (isTop) {
                if (pickersDepth > 0) setFillProgress(98, '🔁 自动选择弹窗仍在进行', '请稍候，不要手动关闭弹窗…');
                else if (readRowJobs().length || rowJobsRunning) setFillProgress(99, '🔁 自动加行仍在进行', '表格行尚未全部添加，稍后自动继续');
                else if (idx < followupDelays.length - 1 && hasDeferredFillWork()) setFillProgress(96 + idx, '🔁 自动补填进行中…', '检测到异步控件，等待页面完成渲染');
                else finishFillBanner(`填充完成：已填 ${finalStats.filled} 项`, '请核对绿色高亮后保存');
              }
            }, delay),
          );
          // 安全加行任务只点击明确的“新增一行”；保存、下一步与提交仍由用户完成。
          try {
            // DOM 元素无法跨消息序列化，剥离后再上报后台聚合
            const plainItems = lastResult.items.map(({ el, ...rest }) => rest);
            void chrome.runtime.sendMessage({ type: 'FILL_RESULT', stats: lastResult.stats, items: plainItems });
          } catch {
            // 后台不存在时忽略
          }
          sendResponse({ ok: true, stats: lastResult.stats });
        })
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    case 'REPORT':
      try {
        void chrome.runtime.sendMessage({ type: 'REPORT_RESULT', report: buildReport() });
        sendResponse({ ok: true });
      } catch {
        sendResponse({ ok: false });
      }
      return false;
    case 'FILL_DONE':
      if (isTop) {
        lastResult = { stats: msg.stats, items: msg.items || [] };
        recordFillResultTelemetry(lastResult.items, lastResult.stats);
        setPanelStatus(formatStats(msg.stats));
      }
      sendResponse({ ok: true });
      return false;
    default:
      return false;
  }
});

// 验证码 OCR 辅助：可选功能，启动时检查用户设置；默认关闭时无任何副作用
if (typeof window !== 'undefined' && isTop) {
  // 异步启动，不阻塞主流程
  void startCaptchaAssistant().catch((e) => console.warn('[tui-captcha] 启动失败：', e));
}

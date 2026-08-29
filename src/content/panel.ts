// 页面内悬浮操作中心（仅顶层 frame 创建）。

import { FillTelemetryEvent, FillTelemetryState } from '../core/fill-telemetry';

export interface PanelHandlers {
  onAction(action: string): void;
}

let handlers: PanelHandlers | null = null;
let el: HTMLElement | null = null;
let dragState: { sx: number; sy: number; ox: number; oy: number } | null = null;
let logFilter: 'all' | 'success' | 'warning' | 'error' = 'all';

const STAGES: Array<{ id: FillTelemetryState['stage']; text: string }> = [
  { id: 'identifying', text: '识别' },
  { id: 'filling', text: '字段' },
  { id: 'picking', text: '弹窗' },
  { id: 'addingRows', text: '表格' },
  { id: 'verifying', text: '回读' },
];

/** 功能：转义日志文字，禁止页面字段名称注入操作中心 HTML。 */
function escapeHtml(text: unknown): string {
  return String(text || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

/** 功能：创建悬浮操作中心并绑定拖拽、筛选和动作按钮。 */
function ensure(): void {
  if (el || !handlers) return;
  const host = document.createElement('div');
  host.id = 'tui-panel';
  host.innerHTML = [
    '<div class="tui-head"><span>🎓 填写操作中心</span><span class="tui-head-actions">',
    '<button type="button" class="tui-minimize" data-ui-act="minimize" title="折叠运行详情">—</button>',
    '<button type="button" class="tui-close" data-act="close" title="收起">✕</button></span></div>',
    '<div class="tui-runtime">',
    '<div class="tui-current"><span class="tui-current-icon">●</span><div><strong class="tui-current-title">准备就绪</strong><div class="tui-current-detail">可填写当前页，或连续填写并校验后进入下一步。</div></div></div>',
    '<div class="tui-progress"><div class="tui-progress-track"><div class="tui-progress-fill"></div></div><span class="tui-progress-text">等待开始</span></div>',
    `<div class="tui-steps">${STAGES.map((stage) => `<span data-stage="${stage.id}">${stage.text}</span>`).join('<i>›</i>')}</div>`,
    '<div class="tui-counts"><span class="success">成功 <b data-count="filled">0</b></span><span class="warning">跳过 <b data-count="skipped">0</b></span><span class="error">失败 <b data-count="failed">0</b></span><span class="waiting">待处理 <b data-count="waiting">0</b></span></div>',
    '<div class="tui-live-head"><strong>实时记录</strong><div class="tui-log-filters"><button data-log-filter="all" class="active">全部</button><button data-log-filter="warning">警告</button><button data-log-filter="error">失败</button></div></div>',
    '<div class="tui-live-log" role="log" aria-live="polite" aria-relevant="additions"><div class="tui-log-empty">运行后将在这里逐项显示填写、弹窗、表格和回读结果。</div></div>',
    '</div>',
    '<div class="tui-status" role="status" aria-live="polite">📌 密码、验证码、文件上传和最终提交始终由你操作。</div>',
    '<div class="tui-btns">',
    '<button type="button" data-act="fill" class="primary wide">⚡ 一键填充（含自动加行与弹窗点选）</button>',
    '<button type="button" data-act="schools" class="wide">🏫 学校目录（报名入口）</button>',
    '<button type="button" data-act="check" class="wide">🩺 提交前体检</button>',
    '<button type="button" data-act="importprofile" class="wide">📥 从本页提取档案</button>',
    '<button type="button" data-act="sessioncrawl" class="wide">🧭 登录后会话爬取</button>',
    '<button type="button" data-act="copymissing">📋 复制漏填项</button>',
    '<button type="button" data-act="copyreport">🛠 复制字段报告</button>',
    '<button type="button" data-act="clearfill" class="wide">🧽 清除本页已填</button>',
    '<button type="button" data-act="clear">🧹 清除高亮</button>',
    '</div>',
  ].join('');
  (document.body || document.documentElement).appendChild(host);
  el = host;

  host.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const uiAction = button.dataset.uiAct;
    if (uiAction === 'minimize') {
      host.classList.toggle('tui-panel-minimized');
      button.textContent = host.classList.contains('tui-panel-minimized') ? '□' : '—';
      button.title = host.classList.contains('tui-panel-minimized') ? '展开运行详情' : '折叠运行详情';
      return;
    }
    const filter = button.dataset.logFilter as typeof logFilter | undefined;
    if (filter) {
      logFilter = filter;
      host.querySelectorAll('[data-log-filter]').forEach((item) => item.classList.toggle('active', item === button));
      host.querySelectorAll<HTMLElement>('.tui-log-item').forEach((item) => { item.hidden = logFilter !== 'all' && item.dataset.level !== logFilter; });
      return;
    }
    const act = button.dataset.act || '';
    if (act === 'close') hidePanel();
    else if (act && handlers) handlers.onAction(act);
  });

  const head = host.querySelector('.tui-head') as HTMLElement | null;
  if (head) {
    head.addEventListener('pointerdown', (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest('button')) return;
      const rect = host.getBoundingClientRect();
      dragState = { sx: event.clientX, sy: event.clientY, ox: rect.left, oy: rect.top };
      head.setPointerCapture(event.pointerId);
    });
    head.addEventListener('pointermove', (event: PointerEvent) => {
      if (!dragState) return;
      host.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, dragState.ox + event.clientX - dragState.sx))}px`;
      host.style.top = `${Math.max(0, dragState.oy + event.clientY - dragState.sy)}px`;
      host.style.right = 'auto';
    });
    head.addEventListener('pointerup', () => { dragState = null; });
  }
}

/** 功能：把一条脱敏运行事件转换为面板日志。 */
function eventHtml(event: FillTelemetryEvent): string {
  const icon = event.level === 'success' ? '✓' : event.level === 'error' ? '✕' : event.level === 'warning' ? '!' : '→';
  const target = event.targetLabel ? `<strong>${escapeHtml(event.targetLabel)}</strong>` : '';
  const progress = event.total ? `<small>${Math.min(event.current || 0, event.total)}/${event.total}</small>` : '';
  const reason = event.reason ? `<em>${escapeHtml(event.reason)}</em>` : '';
  return `<div class="tui-log-item ${event.level}" data-level="${event.level}" data-sequence="${event.sequence}"><span class="tui-log-icon">${icon}</span><div>${target}<span>${escapeHtml(event.action)}</span>${reason}</div>${progress}</div>`;
}

/** 功能：由统一遥测状态渲染操作中心，避免面板与横幅各自维护运行结论。 */
export function renderPanelTelemetry(state: FillTelemetryState): void {
  ensure();
  if (!el) return;
  el.dataset.stage = state.stage;
  const title = el.querySelector('.tui-current-title');
  const detail = el.querySelector('.tui-current-detail');
  if (title) title.textContent = state.title;
  if (detail) detail.textContent = state.currentLabel ? `${state.currentLabel}${state.detail && !state.detail.includes(state.currentLabel) ? ` · ${state.detail}` : ''}` : state.detail;
  const progress = state.progress.total ? Math.round((100 * state.progress.current) / state.progress.total) : 0;
  const fill = el.querySelector<HTMLElement>('.tui-progress-fill');
  const progressText = el.querySelector('.tui-progress-text');
  if (fill) fill.style.width = `${progress}%`;
  if (progressText) progressText.textContent = state.progress.total ? `${state.progress.current}/${state.progress.total}` : state.active ? '处理中' : '等待开始';
  el.querySelectorAll<HTMLElement>('[data-count]').forEach((node) => {
    const key = node.dataset.count as keyof FillTelemetryState['counts'];
    node.textContent = String(state.counts[key] || 0);
  });
  const currentStage = STAGES.findIndex((stage) => stage.id === state.stage);
  el.querySelectorAll<HTMLElement>('[data-stage]').forEach((node, index) => {
    node.classList.toggle('active', index === currentStage);
    node.classList.toggle('done', currentStage > index || state.stage === 'succeeded');
  });
  const log = el.querySelector<HTMLElement>('.tui-live-log');
  if (log) {
    const visibleEvents = state.events.filter((event) => logFilter === 'all' || event.level === logFilter);
    log.innerHTML = visibleEvents.length ? visibleEvents.map(eventHtml).join('') : '<div class="tui-log-empty">当前筛选条件下没有记录。</div>';
    log.scrollTop = log.scrollHeight;
  }
}

/** 功能：醒目 toast 通知——需要人工介入的关键事件（弹窗待选、行数上限、疑似假保存等）不再只躺在面板日志里。 */
export function showToast(message: string, opts?: { tone?: 'info' | 'warn' | 'error'; duration?: number }): void {
  try {
    let host = document.getElementById('tui-toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'tui-toasts';
      host.setAttribute('role', 'alert');
      host.setAttribute('aria-live', 'assertive');
      (document.body || document.documentElement).appendChild(host);
    }
    const tone = opts?.tone || 'info';
    while (host.children.length >= 4) host.firstElementChild?.remove();
    const item = document.createElement('div');
    item.className = `tui-toast tui-toast-${tone}`;
    const icon = tone === 'error' ? '🔴' : tone === 'warn' ? '⚠️' : 'ℹ️';
    item.innerHTML = `<span class="tui-toast-icon">${icon}</span><span class="tui-toast-text"></span><button type="button" class="tui-toast-close" title="知道了">✕</button>`;
    item.querySelector('.tui-toast-text')!.textContent = message;
    const dismiss = () => item.remove();
    item.querySelector('.tui-toast-close')?.addEventListener('click', dismiss);
    host.appendChild(item);
    setTimeout(dismiss, opts?.duration ?? (tone === 'info' ? 6000 : 10000));
  } catch {
    // toast 失败绝不影响填表主流程
  }
}

export function initPanel(h: PanelHandlers): void { handlers = h; ensure(); }
export function showPanel(): void { ensure(); if (el) el.style.display = ''; }
export function hidePanel(): void { if (el) el.style.display = 'none'; }

/**
 * 功能：显式控制主操作按钮的可用性。
 * 不再从遥测阶段推断忙态——迟到的日志事件（补填轮次/子框架回报）会把阶段翻回"进行中"，
 * 曾导致填写完成后一键填充永久禁用（广东工业大学 ehall 页实测）。
 */
export function setPanelBusy(busy: boolean): void {
  ensure();
  if (!el) return;
  el.querySelectorAll<HTMLButtonElement>('[data-act="fill"],[data-act="importprofile"],[data-act="sessioncrawl"],[data-act="clearfill"]').forEach((button) => { button.disabled = busy; });
}
/** 功能：显示非填充操作提示；填充期间的主状态由 renderPanelTelemetry 统一控制。 */
export function setPanelStatus(text: string): void {
  ensure();
  const status = el ? el.querySelector('.tui-status') : null;
  if (status) status.textContent = text;
}

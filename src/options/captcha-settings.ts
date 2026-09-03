// Captcha 设置页：开关 OCR 服务、选择路线、查看识别历史
// 由 options.html 加载（独立页面，不影响主 options 页面）

import { getCaptchaSettings, setCaptchaSettings, type CaptchaSettings, type CaptchaRoute } from '../core/captcha-settings';
import { getCaptchaHistory, clearCaptchaHistory, type CaptchaHistoryItem } from '../core/captcha-history';
import { probeBridge } from '../core/captcha-bridge';

declare const document: Document;
declare const window: Window;

interface BridgeStatusState {
  ok: boolean;
  message: string;
  loading: boolean;
}

async function init(): Promise<void> {
  const els = {
    enabled: byId<HTMLInputElement>('captchaEnabled'),
    routeA: byId<HTMLInputElement>('routeA'),
    routeB: byId<HTMLInputElement>('routeB'),
    routeBConfig: byId('routeBConfig') as HTMLDivElement,
    routeBEndpoint: byId<HTMLInputElement>('routeBEndpoint'),
    routeBToken: byId<HTMLInputElement>('routeBToken'),
    testBridgeBtn: byId<HTMLButtonElement>('testBridgeBtn'),
    bridgeStatus: byId<HTMLSpanElement>('bridgeStatus'),
    autoTrigger: byId<HTMLInputElement>('autoTrigger'),
    previewDuration: byId<HTMLInputElement>('previewDuration'),
    previewDurationVal: byId('previewDurationVal'),
    confidenceThreshold: byId<HTMLInputElement>('confidenceThreshold'),
    confidenceVal: byId('confidenceVal'),
    statTotal: byId('statTotal'),
    statUsed: byId('statUsed'),
    statAvgConf: byId('statAvgConf'),
    historyBody: byId('historyBody') as HTMLTableSectionElement,
    historyEmpty: byId('historyEmpty'),
    refreshHistoryBtn: byId<HTMLButtonElement>('refreshHistoryBtn'),
    clearHistoryBtn: byId<HTMLButtonElement>('clearHistoryBtn'),
    saveMsg: byId('saveMsg'),
    behaviorCard: byId('behaviorCard'),
    routeCard: byId('routeCard'),
    statsCard: byId('statsCard'),
  };

  // 1. 加载当前设置
  const current = await getCaptchaSettings();
  els.enabled.checked = current.enabled;
  els.routeA.checked = current.route === 'A';
  els.routeB.checked = current.route === 'B';
  els.routeBEndpoint.value = current.routeBEndpoint;
  els.routeBToken.value = current.routeBToken;
  els.autoTrigger.checked = current.autoTrigger;
  els.previewDuration.value = String(current.previewDuration);
  els.previewDurationVal.textContent = `${current.previewDuration}ms`;
  els.confidenceThreshold.value = String(current.confidenceThreshold);
  els.confidenceVal.textContent = `${current.confidenceThreshold}%`;
  updateCardsEnabled(current.enabled, current.route, els);

  // 2. 事件绑定
  els.enabled.addEventListener('change', () => {
    void save({ enabled: els.enabled.checked }, els);
  });
  els.routeA.addEventListener('change', () => {
    if (els.routeA.checked) void save({ route: 'A' }, els);
  });
  els.routeB.addEventListener('change', () => {
    if (els.routeB.checked) void save({ route: 'B' }, els);
  });
  els.routeBEndpoint.addEventListener('change', () => {
    void save({ routeBEndpoint: els.routeBEndpoint.value.trim() || 'http://localhost:18765' }, els);
  });
  els.routeBToken.addEventListener('change', () => {
    void save({ routeBToken: els.routeBToken.value.trim() }, els);
  });
  els.autoTrigger.addEventListener('change', () => {
    void save({ autoTrigger: els.autoTrigger.checked }, els);
  });
  els.previewDuration.addEventListener('input', () => {
    els.previewDurationVal.textContent = `${els.previewDuration.value}ms`;
  });
  els.previewDuration.addEventListener('change', () => {
    void save({ previewDuration: parseInt(els.previewDuration.value, 10) }, els);
  });
  els.confidenceThreshold.addEventListener('input', () => {
    els.confidenceVal.textContent = `${els.confidenceThreshold.value}%`;
  });
  els.confidenceThreshold.addEventListener('change', () => {
    void save({ confidenceThreshold: parseInt(els.confidenceThreshold.value, 10) }, els);
  });
  els.testBridgeBtn.addEventListener('click', () => {
    void testBridge(els);
  });
  els.refreshHistoryBtn.addEventListener('click', () => {
    void loadHistory(els);
  });
  els.clearHistoryBtn.addEventListener('click', () => {
    if (window.confirm('确定清除所有验证码识别历史？')) {
      void clearCaptchaHistory().then(() => loadHistory(els));
    }
  });

  // 3. 初始加载历史
  await loadHistory(els);
}

function updateCardsEnabled(
  enabled: boolean,
  route: CaptchaRoute,
  els: ReturnType<typeof getEls>,
): void {
  els.behaviorCard.style.opacity = enabled ? '1' : '0.5';
  els.behaviorCard.style.pointerEvents = enabled ? 'auto' : 'none';
  els.statsCard.style.opacity = enabled ? '1' : '0.5';
  els.statsCard.style.pointerEvents = enabled ? 'auto' : 'none';
  els.routeBConfig.classList.toggle('hidden', !enabled || route !== 'B');
}

function getEls(): any {
  // 简化：使用 document 实时查询
  return {
    enabled: byId<HTMLInputElement>('captchaEnabled'),
    routeA: byId<HTMLInputElement>('routeA'),
    routeB: byId<HTMLInputElement>('routeB'),
    routeBConfig: byId('routeBConfig') as HTMLDivElement,
    routeBEndpoint: byId<HTMLInputElement>('routeBEndpoint'),
    routeBToken: byId<HTMLInputElement>('routeBToken'),
    testBridgeBtn: byId<HTMLButtonElement>('testBridgeBtn'),
    bridgeStatus: byId<HTMLSpanElement>('bridgeStatus'),
    autoTrigger: byId<HTMLInputElement>('autoTrigger'),
    previewDuration: byId<HTMLInputElement>('previewDuration'),
    previewDurationVal: byId('previewDurationVal'),
    confidenceThreshold: byId<HTMLInputElement>('confidenceThreshold'),
    confidenceVal: byId('confidenceVal'),
    statTotal: byId('statTotal'),
    statUsed: byId('statUsed'),
    statAvgConf: byId('statAvgConf'),
    historyBody: byId('historyBody') as HTMLTableSectionElement,
    historyEmpty: byId('historyEmpty'),
    refreshHistoryBtn: byId<HTMLButtonElement>('refreshHistoryBtn'),
    clearHistoryBtn: byId<HTMLButtonElement>('clearHistoryBtn'),
    saveMsg: byId('saveMsg'),
    behaviorCard: byId('behaviorCard'),
    routeCard: byId('routeCard'),
    statsCard: byId('statsCard'),
  };
}

async function save(patch: Partial<CaptchaSettings>, els: ReturnType<typeof getEls>): Promise<void> {
  await setCaptchaSettings(patch);
  // 重新加载以联动卡片启用状态
  const cur = await getCaptchaSettings();
  updateCardsEnabled(cur.enabled, cur.route, els);
  showSaveMsg(els);
}

async function testBridge(els: ReturnType<typeof getEls>): Promise<void> {
  els.bridgeStatus.innerHTML = '<span class="status-dot" style="background:#f59e0b;"></span>检测中…';
  const result = await probeBridge({
    endpoint: els.routeBEndpoint.value.trim() || 'http://localhost:18765',
    token: '', // health check 不需要 token
  });
  if (result.ok) {
    els.bridgeStatus.innerHTML = `<span class="status-dot status-online"></span>在线 (${result.version || 'OK'})`;
  } else {
    els.bridgeStatus.innerHTML = `<span class="status-dot status-offline"></span>离线 (${result.message || '连接失败'})`;
  }
}

async function loadHistory(els: ReturnType<typeof getEls>): Promise<void> {
  const list = await getCaptchaHistory();
  els.historyBody.innerHTML = '';
  let total = list.length;
  let used = 0;
  let confSum = 0;
  for (const item of list) {
    if (item.used) used++;
    confSum += item.confidence;
    const tr = document.createElement('tr');
    const time = new Date(item.timestamp).toLocaleString();
    tr.innerHTML = `
      <td>${escapeHtml(time)}</td>
      <td><strong>${escapeHtml(item.text)}</strong></td>
      <td>${Math.round(item.confidence * 100)}%</td>
      <td><span class="badge badge-${item.source}">${item.source}</span></td>
      <td>${item.used ? '<span class="badge badge-used">已采纳</span>' : '<span style="color:#94a3b8">—</span>'}</td>
    `;
    els.historyBody.appendChild(tr);
  }
  els.statTotal.textContent = String(total);
  els.statUsed.textContent = String(used);
  els.statAvgConf.textContent = total ? `${Math.round((confSum / total) * 100)}%` : '-';
  els.historyEmpty.style.display = total ? 'none' : 'block';
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

let saveMsgTimer: number | null = null;
function showSaveMsg(els: ReturnType<typeof getEls>): void {
  if (saveMsgTimer !== null) {
    window.clearTimeout(saveMsgTimer);
    saveMsgTimer = null;
  }
  els.saveMsg.style.display = 'block';
  saveMsgTimer = window.setTimeout(() => {
    els.saveMsg.style.display = 'none';
    saveMsgTimer = null;
  }, 1800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
}

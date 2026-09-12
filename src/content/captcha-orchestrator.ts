// 验证码识别编排：检测 → 识别 → 预览 → 写入 → 记录
// 在 content script 中作为协调器，调用 detector + ocr + bridge。
//
// UX 流程：
// 1. 检测到验证码对 → 插入 ghost button（淡蓝色半透明「识别」按钮）
// 2. 用户点击 → 调用 OCR（路线 A 或 B）
// 3. 识别结果 → 在 input 上方显示半透明浮层（1.5s 倒计时）
// 4. 倒计时内用户点击取消 → 回退
// 5. 倒计时结束 → 写入 input.value，触发 input/change 事件
// 6. 记录到 history

import { detectCaptchaPairs, startMutationObserver, type CaptchaPair, imgToDataUrl } from './captcha-detector';
import { recognizeCaptchaRouteA } from './captcha-ocr';
import { getCaptchaSettings } from '../core/captcha-settings';
import { dispatchValueEvents } from '../core/event-policy';
import { recognizeCaptchaRouteB } from '../core/captcha-bridge';
import { appendCaptchaHistory, markLastHistoryUsed } from '../core/captcha-history';
import type { CaptchaSettings } from '../core/captcha-types';

let observer: { observer: MutationObserver; stop: () => void } | null = null;
let settings: CaptchaSettings | null = null;

const PREVIEW_CLASS = 'tui-captcha-preview';
const BUTTON_CLASS = 'tui-captcha-button';

/** 功能：启动验证码辅助（在 content script 初始化时调用一次）。 */
export async function startCaptchaAssistant(): Promise<void> {
  settings = await getCaptchaSettings();
  if (!settings.enabled) {
    // 完全降级：什么都不做
    return;
  }
  // 监听设置变化（用户从设置页改完开关后立即生效）
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'sync' || !changes['tui-captcha-settings']) return;
      const newSettings = changes['tui-captcha-settings'].newValue as CaptchaSettings | undefined;
      if (!newSettings || !newSettings.enabled) {
        // 用户关闭 → 停止
        stopCaptchaAssistant();
        return;
      }
      settings = newSettings;
    });
  }
  // 启动检测
  scanAndAttach();
  observer = startMutationObserver((pair) => attachToPair(pair));
}

/** 功能：关闭验证码辅助。 */
export function stopCaptchaAssistant(): void {
  if (observer) {
    observer.stop();
    observer = null;
  }
  // 移除所有 ghost button
  document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`.${PREVIEW_CLASS}`).forEach((el) => el.remove());
}

/** 功能：初始扫描 + 启动 MutationObserver。 */
function scanAndAttach(): void {
  if (!document.body) return;
  const pairs = detectCaptchaPairs(document);
  for (const pair of pairs) {
    attachToPair(pair);
  }
}

/** 功能：为单个验证码对插入 ghost button。 */
function attachToPair(pair: CaptchaPair): void {
  if (!settings) return;
  if (pair.input.dataset.tuiCaptchaButtonAttached) return; // 已挂载
  pair.input.dataset.tuiCaptchaButtonAttached = '1';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = BUTTON_CLASS;
  btn.textContent = '识别';
  btn.title = '本地 OCR 识别验证码（默认需点按钮）';
  btn.setAttribute('data-tui-captcha-button', '1');
  Object.assign(btn.style, {
    position: 'absolute',
    zIndex: '2147483647',
    background: 'rgba(59, 130, 246, 0.85)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '12px',
    cursor: 'pointer',
    userSelect: 'none',
  });
  // 定位到 img 旁边
  positionButton(btn, pair.img);
  document.body.appendChild(btn);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void handleRecognizeClick(pair, btn);
  });
  // 监听 img src 变化（验证码刷新）：重新定位按钮
  pair.img.addEventListener('load', () => {
    if (btn.isConnected) positionButton(btn, pair.img);
  });
  // 存储 pair 引用（用于卸载时清理）
  (btn as any).__captchaPair = pair;
  // autoTrigger：用户开启后检测到验证码直接调 OCR，不点按钮
  if (settings.autoTrigger) {
    void handleRecognizeClick(pair, btn);
  }
}

function positionButton(btn: HTMLButtonElement, img: HTMLImageElement): void {
  const rect = img.getBoundingClientRect();
  if (rect.width === 0) return; // 不可见
  btn.style.left = `${rect.right + window.scrollX + 4}px`;
  btn.style.top = `${rect.top + window.scrollY + (rect.height - 22) / 2}px`;
}

/** 功能：用户点击 ghost button → 调 OCR → 显示预览 → 写入。 */
async function handleRecognizeClick(pair: CaptchaPair, btn: HTMLButtonElement): Promise<void> {
  if (!settings) return;
  btn.textContent = '识别中…';
  btn.setAttribute('disabled', '1');
  let result: { text: string; confidence: number; source: 'A' | 'B' } | null = null;
  let err: Error | null = null;
  try {
    // 统一入口：路线 B 失败时自动降级到路线 A
    if (settings.route === 'A') {
      // 路线 A 始终只走 tesseract.js
      result = await recognizeCaptchaRouteA(pair.img);
    } else {
      // 路线 B：先试 B，失败/异常时降级到 A（用户无感）
      try {
        const dataUrl = await imgToDataUrl(pair.img);
        if (!dataUrl) throw new Error('图片数据获取失败');
        result = await recognizeCaptchaRouteB(dataUrl, {
          endpoint: settings.routeBEndpoint,
          token: settings.routeBToken,
        });
      } catch (bErr) {
        console.warn('[tui-captcha] 路线 B 失败，降级到路线 A：', bErr);
        result = await recognizeCaptchaRouteA(pair.img);
        if (result) result = { ...result, source: 'A' as const };
      }
    }
  } catch (e) {
    err = e instanceof Error ? e : new Error(String(e));
  } finally {
    btn.removeAttribute('disabled');
    btn.textContent = '识别';
  }
  if (err || !result || !result.text) {
    showToast(`识别失败：${err?.message || '空结果'}`, pair.input);
    return;
  }
  // 写入 history（返回带 id 的完整条目，用于成功后标记 used）
  const historyItem = await appendCaptchaHistory({
    text: result.text,
    confidence: result.confidence,
    source: result.source,
    url: window.location.href,
    timestamp: Date.now(),
    used: false,
  });
  // 显示预览
  await showPreviewAndWrite(pair, result.text, result.confidence, historyItem);
}

let activePreview: { cleanup: () => void } | null = null;

/** 功能：显示识别结果预览 + 倒计时；倒计时结束或用户取消时清理。 */
async function showPreviewAndWrite(
  pair: CaptchaPair,
  text: string,
  confidence: number,
  historyItem?: { text: string; url: string; id?: string },
): Promise<void> {
  if (!settings) return;
  // 取消上一个 preview
  if (activePreview) activePreview.cleanup();
  if (confidence * 100 < settings.confidenceThreshold) {
    showToast(`低置信度 (${Math.round(confidence * 100)}%)，未自动填充`, pair.input);
    return;
  }
  // 半透明浮层
  const preview = document.createElement('div');
  preview.className = PREVIEW_CLASS;
  Object.assign(preview.style, {
    position: 'absolute',
    zIndex: '2147483647',
    background: 'rgba(34, 197, 94, 0.9)',
    color: 'white',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  });
  const rect = pair.input.getBoundingClientRect();
  preview.style.left = `${rect.left + window.scrollX}px`;
  preview.style.top = `${rect.bottom + window.scrollY + 4}px`;
  preview.textContent = `${text} · ${settings.previewDuration}ms 内点击取消`;
  preview.style.cursor = 'pointer';
  document.body.appendChild(preview);
  let written = false;
  let cancelled = false;
  const timer = window.setTimeout(() => {
    if (cancelled) return;
    cleanup();
    doWrite();
  }, settings.previewDuration);
  const cleanup = (): void => {
    window.clearTimeout(timer);
    if (preview.isConnected) preview.remove();
    if (activePreview && activePreview.cleanup === cleanup) activePreview = null;
  };
  const doWrite = (): void => {
    if (written) return;
    written = true;
    setInputValueWithEvents(pair.input, text);
    // 写入成功：把对应 history 标记为 used（让设置页"用户采纳"统计真实反映）
    if (historyItem) {
      void markLastHistoryUsed(historyItem.url, historyItem.text, true);
    }
  };
  preview.addEventListener('click', () => {
    cancelled = true;
    cleanup();
    showToast('已取消，请手动输入', pair.input);
  });
  activePreview = { cleanup };
}

/** 功能：写入 input 值 + 触发 input/change 事件（兼容 React 受控组件）。 */
function setInputValueWithEvents(input: HTMLInputElement, value: string): void {
  // 模拟真实用户输入（避免 React/Vue 受控组件检测到 setter 而吞掉）
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  // A1/W-6:派发收敛至 event-policy（tail=none 与原两件套逐字面等价）。
  dispatchValueEvents(input, { tail: 'none' });
  input.focus();
}

/** 功能：轻量 Toast 提示。 */
let toastEl: HTMLDivElement | null = null;
function showToast(message: string, anchor: Element): void {
  if (toastEl && toastEl.isConnected) toastEl.remove();
  const toast = document.createElement('div');
  toast.className = 'tui-captcha-toast';
  Object.assign(toast.style, {
    position: 'absolute',
    zIndex: '2147483647',
    background: 'rgba(220, 38, 38, 0.9)',
    color: 'white',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    pointerEvents: 'none',
  });
  const rect = anchor.getBoundingClientRect();
  toast.style.left = `${rect.left + window.scrollX}px`;
  toast.style.top = `${rect.top + window.scrollY - 32}px`;
  toast.textContent = message;
  document.body.appendChild(toast);
  toastEl = toast;
  window.setTimeout(() => {
    if (toast.isConnected) toast.remove();
    if (toastEl === toast) toastEl = null;
  }, 3000);
}

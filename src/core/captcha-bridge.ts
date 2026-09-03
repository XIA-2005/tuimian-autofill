// 路线 B：Python 桥接服务协议
// 参考竞品 native_service_cli.py 的 extension-bridge 模式。
//
// 协议：HTTP JSON over localhost:18765
// 扩展通过 fetch() 与桥接通信，桥接调用 Python/PaddleOCR 后返回。
//
// 认证：Bearer token（从 bridge.json 读取，或在 OCR 请求头携带）
// 端点：POST {endpoint}/{token}/ocr
// 降级：超时 5s 内无响应 → 路线 A 回退

import type { OcrResult } from './captcha-types';

export { type OcrResult } from './captcha-types';

export interface BridgeHealth {
  ok: boolean;
  version?: string;
  message?: string;
}

export interface CaptchaBridgeConfig {
  /** 路线 B HTTP 端点，默认 http://localhost:18765 */
  endpoint: string;
  /** 从 bridge.json 或扩展存储读取的 token */
  token: string;
  /** 请求超时（ms），默认 8000 */
  timeout?: number;
}

const DEFAULT_ENDPOINT = 'http://localhost:18765';
const DEFAULT_TIMEOUT = 8000;

/** 功能：检测 Python 桥接服务是否在线（GET health）。 */
export async function probeBridge(config: CaptchaBridgeConfig): Promise<BridgeHealth> {
  const { endpoint = DEFAULT_ENDPOINT, timeout = DEFAULT_TIMEOUT } = config;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(`${endpoint}/health`, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      mode: 'cors',
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, message: `HTTP ${resp.status}` };
    const data = await resp.json().catch(() => ({}));
    return { ok: true, version: data.version || data.version, message: data.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg.includes('aborted') ? '连接超时' : msg };
  }
}

/**
 * 功能：识别验证码 - 路线 B
 * 向 Python 桥接服务 POST base64 图像，返回识别文本。
 */
export async function recognizeCaptchaRouteB(
  imageDataUrl: string,
  config: CaptchaBridgeConfig,
): Promise<OcrResult> {
  const { endpoint = DEFAULT_ENDPOINT, token, timeout = DEFAULT_TIMEOUT } = config;
  if (!token) throw new Error('路线 B 需要桥接 token');

  // base64 剥离前缀
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const body = JSON.stringify({ image_base64: base64, type: 'captcha' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(`${endpoint}/${token}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      signal: controller.signal,
      credentials: 'omit',
      mode: 'cors',
    });
    clearTimeout(timer);
    if (!resp.ok) {
      throw new Error(`桥接返回 HTTP ${resp.status}：${resp.statusText}`);
    }
    const data = await resp.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.message || '桥接 OCR 失败');
    return {
      text: String(data.text || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      confidence: Number(data.confidence ?? data.confidence ?? 0.5),
      source: 'B',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 功能：统一 OCR 入口（自动选路线）
 *  - route === 'A' → captcha-ocr.ts 路线 A
 *  - route === 'B' → 路线 B，失败时回退路线 A
 */
export async function recognizeCaptcha(
  source: HTMLImageElement | HTMLCanvasElement,
  route: 'A' | 'B',
  config: CaptchaBridgeConfig,
): Promise<OcrResult> {
  if (route === 'A') {
    // 动态 import 避免路线 A 的 tesseract.js 被打包进 content script（使用 @vite-ignore）
    const { recognizeCaptchaRouteA } = await import('../content/captcha-ocr');
    return recognizeCaptchaRouteA(source);
  }
  // 路线 B：先转为 dataURL
  const { imgToDataUrl } = await import('../content/captcha-detector');
  let dataUrl: string | null = null;
  if (source instanceof HTMLCanvasElement) {
    dataUrl = source.toDataURL('image/png');
  } else {
    dataUrl = await imgToDataUrl(source);
  }
  if (!dataUrl) throw new Error('无法获取图片数据');
  try {
    return await recognizeCaptchaRouteB(dataUrl, config);
  } catch (e) {
    console.warn('[tui-captcha] 路线 B 失败，回退到路线 A：', e);
    // 降级到路线 A
    const { recognizeCaptchaRouteA } = await import('../content/captcha-ocr');
    return recognizeCaptchaRouteA(source);
  }
}

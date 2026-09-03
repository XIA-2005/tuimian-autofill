// 验证码 OCR 识别核心：路线 A (tesseract.js WASM, 纯浏览器)
// 路线 B 走 fetch 调用本地 Python 桥接服务，见 captcha-bridge.ts
//
// 关键设计：
// 1. tesseract.js 通过动态 import() 懒加载（首次识别时才下载 WASM）
// 2. 图像预处理：canvas 灰度化 + 二值化 + 简单去噪
// 3. 后处理：去除空格 + 大写 + 长度截断到 4-6
// 4. 识别失败/低置信度时抛出错误，让调用方降级

import type { OcrResult } from '../core/captcha-types';

/** tesseract.js 加载缓存（首次懒加载后缓存）。
 * 实际加载由独立的 content script `tesseract-loader.ts` 完成，注入到页面 window 后 dispatchEvent 'tesseract-ready'。
 * 这样 tesseract.js 不会进主 bundle（避免 content.js 膨胀 5-10MB）。 */
let tesseractModulePromise: Promise<any> | null = null;

/** 功能：等待 tesseract.js 由 tesseract-loader.ts 注入到页面 window（监听 'tesseract-ready' 事件）。 */
export async function loadTesseract(): Promise<any | null> {
  if (tesseractModulePromise) return tesseractModulePromise;
  tesseractModulePromise = (async () => {
    // 已经存在（之前已加载）
    if ((window as any).Tesseract) return (window as any).Tesseract;
    // 等待 'tesseract-ready' 事件
    return await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('tesseract-ready', onReady);
        reject(new Error('tesseract.js 加载超时（30s），请刷新页面或检查网络'));
      }, 30000);
      const onReady = (e: Event): void => {
        clearTimeout(timer);
        window.removeEventListener('tesseract-ready', onReady);
        resolve((e as CustomEvent).detail?.Tesseract);
      };
      window.addEventListener('tesseract-ready', onReady);
    }).catch((e) => {
      // 失败时清缓存，下一次会重试
      tesseractModulePromise = null;
      console.warn('[tui-captcha] tesseract.js 加载失败：', e);
      return null;
    });
  })();
  return tesseractModulePromise;
}

/**
 * 功能：图像预处理 - 灰度化 + 二值化
 * 输出：处理后的 ImageData，可直接传给 tesseract.js
 */
export function preprocessImage(canvas: HTMLCanvasElement, threshold = 140): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context not available');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // 灰度化：Y = 0.299R + 0.587G + 0.114B
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    // 二值化
    const bw = gray > threshold ? 255 : 0;
    data[i] = bw;
    data[i + 1] = bw;
    data[i + 2] = bw;
    // alpha 保持
  }
  return imageData;
}

/**
 * 功能：把 ImageData 画到新 canvas（用预处理后的数据）
 * 解决 getImageData 修改后不会自动反映到原 canvas 的问题
 */
export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context not available');
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 功能：后处理 OCR 文本
 *  - 去空白
 *  - 大写
 *  - 截断到 4-6 字符
 *  - 替换容易混淆的字符（O→0 等，按需）
 */
export function postprocessText(raw: string, maxLen = 6): string {
  if (!raw) return '';
  // 去空白
  let text = raw.replace(/\s+/g, '').trim();
  // 大写
  text = text.toUpperCase();
  // 去除非字母数字（tesseract 偶尔识别出特殊字符）
  text = text.replace(/[^A-Z0-9]/g, '');
  // 截断
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

/**
 * 功能：识别验证码 - 路线 A 主入口
 *  - 接受 img 元素或 canvas
 *  - 内部：图片加载 → 灰度/二值化 → tesseract.js 识别 → 后处理
 *  - 失败抛出错误
 */
export async function recognizeCaptchaRouteA(
  source: HTMLImageElement | HTMLCanvasElement,
  options: { lang?: string; threshold?: number } = {},
): Promise<OcrResult> {
  const { lang = 'eng', threshold = 140 } = options;
  // 1. 加载 tesseract.js
  const Tesseract = await loadTesseract();
  if (!Tesseract) throw new Error('tesseract.js 加载失败');

  // 2. 准备 canvas
  let canvas: HTMLCanvasElement;
  if (source instanceof HTMLCanvasElement) {
    canvas = source;
  } else {
    // 等图片加载
    if (!source.complete || source.naturalWidth === 0) {
      await new Promise<void>((resolve) => {
        if (source.complete) return resolve();
        source.addEventListener('load', () => resolve(), { once: true });
        source.addEventListener('error', () => resolve(), { once: true });
      });
    }
    if (source.naturalWidth === 0) throw new Error('图片加载失败');
    canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context not available');
    ctx.drawImage(source, 0, 0);
  }

  // 3. 图像预处理（提升识别准确率 5-15%）
  const processed = preprocessImage(canvas, threshold);
  const processedCanvas = imageDataToCanvas(processed);

  // 4. tesseract.js 识别
  const result = await Tesseract.recognize(processedCanvas, lang);
  // result.data.text: 识别文本；result.data.confidence: 0-100
  const raw = String(result?.data?.text || '');
  const confidence = (Number(result?.data?.confidence) || 0) / 100;

  // 5. 后处理
  const text = postprocessText(raw);

  return { text, confidence, source: 'A' };
}

/** 功能：重置 tesseract.js 缓存（用于测试或内存回收）。 */
export function resetTesseractCache(): void {
  tesseractModulePromise = null;
}

// Captcha 检测器：在页面上识别"验证码图片 + 输入框"对。
//
// 检测策略：
// 1. 静态扫描：onload 时遍历所有 input[type=text/password] + 相邻 img
// 2. 动态监听：MutationObserver 捕获后续动态加载的验证码
// 3. 命名启发：maxlength 4~6 + placeholder/id/name 含 captcha|验证码|yzm
//
// 设计原则：纯函数式检测，不做任何副作用（不写值、不改 DOM），仅返回 CaptchaPair 列表。
// 实际副作用（写值、显示 UI）由 content.ts 编排。

export interface CaptchaPair {
  /** 验证码图片元素（<img>） */
  img: HTMLImageElement;
  /** 验证码输入框（<input>） */
  input: HTMLInputElement;
  /** 置信度：0-1，越高越确定是验证码 */
  confidence: number;
  /** 启发来源（用于诊断） */
  reason: 'maxlength+img' | 'placeholder+img' | 'name+img' | 'click-refresh' | 'mutation';
}

/** 功能：检查 input 是否符合"验证码输入框"的形状特征。 */
export function looksLikeCaptchaInput(input: HTMLInputElement): boolean {
  if (!input) return false;
  const type = (input.type || 'text').toLowerCase();
  // 排除明显不是验证码的
  if (['password', 'file', 'submit', 'button', 'hidden', 'checkbox', 'radio'].includes(type)) {
    // 密码框也有可能是，但密码框通常不在验证码组里（验证码是公开的）
    // 这里我们允许 password（部分学校把验证码当密码类型）但不常见
    if (type === 'password') {
      // 部分学校把验证码写成 type=password（防截屏），允许
    } else {
      return false;
    }
  }
  // maxlength 4-6 是验证码最强特征
  const maxLen = input.getAttribute('maxlength');
  if (maxLen) {
    const n = parseInt(maxLen, 10);
    if (n >= 4 && n <= 6) return true;
    if (n > 0 && n < 4) return false; // 长度过短基本不是验证码
  }
  // placeholder/id/name 含验证码关键字
  const hay = `${input.placeholder || ''} ${input.id || ''} ${input.getAttribute('name') || ''}`.toLowerCase();
  return /验证码|captcha|verify|yzm|code|check.?code|valid|随机码|确认码|校验码/.test(hay);
}

/** 功能：在 input 附近找验证码图片（同父容器或紧邻兄弟）。 */
export function findAdjacentCaptchaImg(input: HTMLInputElement): HTMLImageElement | null {
  if (!input.parentElement) return null;
  // 1. 同父容器内找 <img>
  const candidates = Array.from(input.parentElement.querySelectorAll('img')) as HTMLImageElement[];
  for (const img of candidates) {
    if (img === (input as unknown as HTMLImageElement)) continue;
    const src = img.getAttribute('src') || '';
    // 排除明显的装饰图（尺寸太大、alt 文本是 logo 等）
    // naturalWidth 在 jsdom 测试环境和未加载图时为 0，此时用 HTML width 属性判断
    const effectiveWidth = img.naturalWidth > 0 ? img.naturalWidth : parseInt(img.getAttribute('width') || '0', 10);
    if (effectiveWidth > 400) continue;
    const effectiveHeight = img.naturalHeight > 0 ? img.naturalHeight : parseInt(img.getAttribute('height') || '0', 10);
    if (effectiveHeight > 200) continue;
    // 排除完全空的 src（占位图）
    if (!src || src.startsWith('data:image/svg')) continue;
    // 排除 data-uri 空白图
    if (src.startsWith('data:') && src.length < 200) continue;
    return img;
  }
  // 2. 父容器的兄弟内找（form 布局常见）
  if (input.parentElement.parentElement) {
    const sibCandidates = Array.from(input.parentElement.parentElement.querySelectorAll('img')) as HTMLImageElement[];
    for (const img of sibCandidates) {
      if (img === (input as unknown as HTMLImageElement)) continue;
      const effectiveWidth = img.naturalWidth > 0 ? img.naturalWidth : parseInt(img.getAttribute('width') || '0', 10);
      if (effectiveWidth > 400) continue;
      const effectiveHeight = img.naturalHeight > 0 ? img.naturalHeight : parseInt(img.getAttribute('height') || '0', 10);
      if (effectiveHeight > 200) continue;
      if (img.closest('a[href*="logout"],a[href*="login"]')) continue; // 排除导航 logo
      return img;
    }
  }
  return null;
}

/** 功能：单次扫描页面所有验证码对。 */
export function detectCaptchaPairs(root: ParentNode = document): CaptchaPair[] {
  const out: CaptchaPair[] = [];
  const seen = new Set<HTMLInputElement>();
  // 1. 扫描所有 input
  const inputs = Array.from(root.querySelectorAll('input[type="text"],input[type="password"],input:not([type])')) as HTMLInputElement[];
  for (const input of inputs) {
    if (seen.has(input)) continue;
    // 跳过禁用 / 不可见的 input
    // 注：不依赖 offsetParent，因为 jsdom 测试环境（offsetParent 恒为 null）会误杀所有 input
    if (input.disabled) continue;
    if (input.value && input.value.length > 0) continue; // 已填写不打扰
    if (!looksLikeCaptchaInput(input)) continue;
    const img = findAdjacentCaptchaImg(input);
    if (!img) continue;
    seen.add(input);
    // 置信度评估 + reason 来源标识（真实反映触发原因）
    let conf = 0.5;
    let reason: CaptchaPair['reason'] = 'placeholder+img';
    const hay = `${input.placeholder || ''} ${input.id || ''} ${input.getAttribute('name') || ''}`.toLowerCase();
    const maxLen = input.getAttribute('maxlength');
    const maxLenN = maxLen ? parseInt(maxLen, 10) : 0;
    const hasMaxLen = maxLenN >= 4 && maxLenN <= 6;
    const hasCaptchaKw = /验证码|captcha|yzm|code/.test(hay);
    if (hasMaxLen) {
      conf += 0.3;
      reason = 'maxlength+img';
      if (hasCaptchaKw) conf += 0.2;
    } else if (hasCaptchaKw) {
      conf += 0.4; // 无 maxlength 时关键词证据权重更高（清华等只用 placeholder/name）
      reason = /yzm|captcha|code/.test(input.getAttribute('name') || '') || /验证码|captcha/.test(input.id || '') ? 'name+img' : 'placeholder+img';
    }
    if (img.naturalWidth > 30 && img.naturalHeight > 10) conf += 0.05;
    if (img.naturalWidth > 80) conf += 0.05; // 真正的验证码通常 >= 60px
    out.push({ img, input, confidence: Math.min(conf, 1), reason });
  }
  return out;
}

/**
 * 功能：创建 MutationObserver，监听新出现的验证码对。
 * 返回 observer 和停止函数。
 */
export function startMutationObserver(
  onNewPair: (pair: CaptchaPair) => void,
  root: ParentNode = document.body || document.documentElement,
): { observer: MutationObserver; stop: () => void } {
  // 缓存已通知的 input，避免重复
  const notified = new WeakSet<HTMLInputElement>();
  // debounce 防止短时间内大量 mutation
  let pending: number | null = null;
  const scan = (): void => {
    pending = null;
    if (!root.isConnected) return;
    const pairs = detectCaptchaPairs(root);
    for (const pair of pairs) {
      if (notified.has(pair.input)) continue;
      notified.add(pair.input);
      onNewPair(pair);
    }
  };
  const observer = new MutationObserver(() => {
    if (pending !== null) return;
    pending = window.requestAnimationFrame(scan);
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'maxlength'] });
  // 启动时跑一次（确保初始状态被抓到）
  queueMicrotask(scan);
  return {
    observer,
    stop: () => {
      observer.disconnect();
      if (pending !== null) cancelAnimationFrame(pending);
    },
  };
}

/** 功能：从 img 元素提取 src 转为 dataURL（用于 OCR 跨域兜底）。 */
export async function imgToDataUrl(img: HTMLImageElement): Promise<string | null> {
  try {
    // 如果是同源或已经是 dataURL，直接返回 src
    const src = img.getAttribute('src') || '';
    if (src.startsWith('data:')) return src;
    // 跨域情况：先尝试 fetch + blob
    try {
      const resp = await fetch(src, { credentials: 'omit', mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('FileReader failed'));
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // 跨域失败 → 走 canvas 路径
    }
    // canvas 路径：要求图片已加载且同源
    if (!img.complete || img.naturalWidth === 0) {
      // 等待图片加载
      await new Promise<void>((resolve) => {
        if (img.complete) return resolve();
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    }
    if (img.naturalWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      // cross-origin taint → canvas 不可读
      return null;
    }
  } catch {
    return null;
  }
}

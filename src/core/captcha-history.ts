// 验证码识别历史：记录每次 OCR 识别结果 + 用户采纳状态
// 用于：设置页"识别历史"展示、用户回溯"我上次识别对了多少"。

const HISTORY_KEY = 'tui-captcha-history';
const MAX_HISTORY = 20;

export interface CaptchaHistoryItem {
  id: string;
  text: string;
  confidence: number;
  source: 'A' | 'B';
  url: string;
  timestamp: number;
  used: boolean;
}

function getStore(): chrome.storage.StorageArea | null {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) return chrome.storage.local;
  return null;
}

export async function appendCaptchaHistory(item: Omit<CaptchaHistoryItem, 'id'>): Promise<CaptchaHistoryItem> {
  const store = getStore();
  if (!store) return { ...item, id: '' } as CaptchaHistoryItem;
  const fullItem: CaptchaHistoryItem = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  const result = await new Promise<{ [key: string]: any }>((resolve) => {
    store.get(HISTORY_KEY, (data) => resolve(data || {}));
  });
  const list = Array.isArray(result[HISTORY_KEY]) ? (result[HISTORY_KEY] as CaptchaHistoryItem[]) : [];
  list.unshift(fullItem);
  if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
  return new Promise<CaptchaHistoryItem>((resolve) => {
    store.set({ [HISTORY_KEY]: list }, () => resolve(fullItem));
  });
}

/**
 * 功能：把最近一条匹配（url + text + 时间接近）的 history 标记为 used=true。
 * 用于 OCR 真正写入 input 后回写统计，让设置页的"用户采纳"指标真实反映。
 */
export async function markLastHistoryUsed(
  matchUrl: string,
  matchText: string,
  used: boolean,
): Promise<boolean> {
  const store = getStore();
  if (!store) return false;
  const result = await new Promise<{ [key: string]: any }>((resolve) => {
    store.get(HISTORY_KEY, (data) => resolve(data || {}));
  });
  const list = Array.isArray(result[HISTORY_KEY]) ? (result[HISTORY_KEY] as CaptchaHistoryItem[]) : [];
  let changed = false;
  for (const item of list) {
    if (item.text === matchText && item.url === matchUrl) {
      if (item.used !== used) {
        item.used = used;
        changed = true;
      }
      break;
    }
  }
  if (!changed) return false;
  return new Promise<boolean>((resolve) => {
    store.set({ [HISTORY_KEY]: list }, () => resolve(true));
  });
}

export async function getCaptchaHistory(): Promise<CaptchaHistoryItem[]> {
  const store = getStore();
  if (!store) return [];
  return new Promise<CaptchaHistoryItem[]>((resolve) => {
    store.get(HISTORY_KEY, (data) => {
      const list = data?.[HISTORY_KEY];
      resolve(Array.isArray(list) ? list : []);
    });
  });
}

export async function clearCaptchaHistory(): Promise<void> {
  const store = getStore();
  if (!store) return;
  return new Promise<void>((resolve) => {
    store.remove(HISTORY_KEY, () => resolve());
  });
}

export async function getCaptchaStats(): Promise<{ total: number; used: number; avgConfidence: number }> {
  const list = await getCaptchaHistory();
  if (!list.length) return { total: 0, used: 0, avgConfidence: 0 };
  const used = list.filter((x) => x.used).length;
  const avgConfidence = list.reduce((sum, x) => sum + x.confidence, 0) / list.length;
  return { total: list.length, used, avgConfidence };
}

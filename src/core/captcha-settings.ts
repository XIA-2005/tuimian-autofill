// Captcha 设置项：保存到 chrome.storage.sync（跨设备同步）
// 默认完全关闭（privacy-first），用户主动开启

import type { CaptchaRoute, CaptchaSettings } from './captcha-types';

export type { CaptchaRoute, CaptchaSettings };

export const DEFAULTS: CaptchaSettings = {
  enabled: false,
  route: 'A',
  autoTrigger: false,
  previewDuration: 1500,
  routeBEndpoint: 'http://localhost:18765',
  routeBToken: '',
  confidenceThreshold: 50,
};

const STORAGE_KEY = 'tui-captcha-settings';

export async function getCaptchaSettings(): Promise<CaptchaSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (data) => {
      const raw = data?.[STORAGE_KEY];
      resolve(raw ? { ...DEFAULTS, ...raw } : { ...DEFAULTS });
    });
  });
}

export async function setCaptchaSettings(patch: Partial<CaptchaSettings>): Promise<void> {
  const cur = await getCaptchaSettings();
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: { ...cur, ...patch } }, () => resolve());
  });
}

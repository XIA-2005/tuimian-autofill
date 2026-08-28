// 本地存储：档案只保存在浏览器 chrome.storage.local，不联网、不上传。

import { emptyProfile, normalizeProfile, Profile } from './profile';

export const PROFILE_KEY = 'profile';

export async function loadProfile(): Promise<Profile> {
  try {
    const res = await chrome.storage.local.get(PROFILE_KEY);
    return normalizeProfile(res ? res[PROFILE_KEY] : undefined);
  } catch {
    return emptyProfile();
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: normalizeProfile(p) });
}

export async function ensureSeed(): Promise<void> {
  try {
    const res = await chrome.storage.local.get(PROFILE_KEY);
    if (!res || !res[PROFILE_KEY]) {
      await chrome.storage.local.set({ [PROFILE_KEY]: emptyProfile() });
    }
  } catch {
    // 忽略：权限异常时不影响扩展其余功能
  }
}

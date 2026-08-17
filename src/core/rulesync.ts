// 规则热更新：默认关闭。开启后仅在用户授权下，从配置的 URL 下载"规则文件"
// （平台适配器 + 字段规则），不包含、不上传任何个人数据。

import { FieldRule } from './matcher';
import { PlatformAdapter, RemoteAdapterSet } from './adapters';

export interface RemoteRules extends RemoteAdapterSet {
  version?: number;
  extraFieldRules?: FieldRule[];
}

export interface Settings {
  remoteRulesEnabled: boolean;
  remoteRulesUrl: string;
}

export const SETTINGS_KEY = 'settings';
export const REMOTE_RULES_KEY = 'remoteRules';
export const DEFAULT_RULES_URL = 'https://raw.githubusercontent.com/tuimian-autofill/rules/main/rules.json';

const DEFAULT_SETTINGS: Settings = { remoteRulesEnabled: false, remoteRulesUrl: DEFAULT_RULES_URL };

export async function loadSettings(): Promise<Settings> {
  try {
    const res = await chrome.storage.local.get(SETTINGS_KEY);
    const s = (res && res[SETTINGS_KEY] ? res[SETTINGS_KEY] : {}) as Partial<Settings>;
    return {
      remoteRulesEnabled: !!s.remoteRulesEnabled,
      remoteRulesUrl: typeof s.remoteRulesUrl === 'string' && s.remoteRulesUrl ? s.remoteRulesUrl : DEFAULT_RULES_URL,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}

export async function loadRemoteRules(): Promise<RemoteRules | null> {
  try {
    const res = await chrome.storage.local.get(REMOTE_RULES_KEY);
    const r = res && res[REMOTE_RULES_KEY];
    return r && typeof r === 'object' ? (r as RemoteRules) : null;
  } catch {
    return null;
  }
}

function validateRemoteRules(data: unknown): RemoteRules {
  if (!data || typeof data !== 'object') throw new Error('规则文件格式错误');
  const d = data as Record<string, unknown>;
  const adapters = Array.isArray(d.adapters) ? (d.adapters as PlatformAdapter[]) : [];
  const extraFieldRules = Array.isArray(d.extraFieldRules) ? (d.extraFieldRules as FieldRule[]) : [];
  for (const a of adapters) {
    if (!a || typeof a.id !== 'string' || typeof a.match !== 'function') throw new Error('适配器格式错误');
  }
  return { version: typeof d.version === 'number' ? d.version : 0, adapters, extraFieldRules };
}

export async function fetchRemoteRules(url: string): Promise<RemoteRules> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('下载失败 HTTP ' + res.status);
  const data: unknown = await res.json();
  return validateRemoteRules(data);
}

export async function syncRemoteRules(): Promise<{ ok: boolean; message: string }> {
  const s = await loadSettings();
  if (!s.remoteRulesEnabled || !s.remoteRulesUrl) return { ok: false, message: '未启用规则更新（默认关闭）' };
  try {
    const rules = await fetchRemoteRules(s.remoteRulesUrl);
    await chrome.storage.local.set({ [REMOTE_RULES_KEY]: rules });
    return {
      ok: true,
      message: `规则已更新：平台适配器 ${(rules.adapters || []).length} 个、字段规则 ${(rules.extraFieldRules || []).length} 条（重启页面后生效）`,
    };
  } catch (e) {
    return { ok: false, message: `更新失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

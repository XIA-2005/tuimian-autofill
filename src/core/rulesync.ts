// 规则热更新：默认关闭。开启后仅在用户授权下，从配置的 URL 下载"规则文件"
// （平台适配器 + 字段规则），不包含、不上传任何个人数据。

import { FieldRule } from './matcher';
import { PlatformAdapter, RemoteAdapterSet } from './adapters';
import { SchoolAdapterPackage, DeclarativeUrlMatch } from './adapters';
import { validateAdapterPackage } from './adapter-packages';

export interface RemoteRules extends RemoteAdapterSet {
  version?: number;
  schemaVersion?: 1;
  minCoreVersion?: string;
  extraFieldRules?: FieldRule[];
  packages?: SchoolAdapterPackage[];
}

export interface Settings {
  remoteRulesEnabled: boolean;
  remoteRulesUrl: string;
}

export const SETTINGS_KEY = 'settings';
export const REMOTE_RULES_KEY = 'remoteRules';
export const REMOTE_RULES_PREVIOUS_KEY = 'remoteRulesPrevious';
export const REMOTE_RULES_CANDIDATE_KEY = 'remoteRulesCandidate';
export const DEFAULT_RULES_URL = 'https://raw.githubusercontent.com/tuimian-autofill/rules/main/rules.json';
export const CORE_PACKAGE_VERSION = '2.0.0';

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
    if (!r || typeof r !== 'object') return null;
    try {
      return validateRemoteRules(r);
    } catch {
      const previous = await chrome.storage.local.get(REMOTE_RULES_PREVIOUS_KEY);
      const fallback = previous && previous[REMOTE_RULES_PREVIOUS_KEY];
      if (!fallback) return null;
      const checked = validateRemoteRules(fallback);
      await chrome.storage.local.set({ [REMOTE_RULES_KEY]: checked });
      return checked;
    }
  } catch {
    return null;
  }
}

function versionParts(value: string): number[] {
  return value.split('.').map((part) => Number(part.replace(/\D.*$/, '')) || 0);
}

function versionAtLeast(current: string, required: string): boolean {
  const a = versionParts(current);
  const b = versionParts(required);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}

export function validateRemoteRules(data: unknown): RemoteRules {
  if (!data || typeof data !== 'object') throw new Error('规则文件格式错误');
  const d = data as Record<string, unknown>;
  if (d.schemaVersion !== 1) throw new Error('规则文件 Schema 版本不受支持');
  const adapters = Array.isArray(d.adapters) ? (d.adapters as PlatformAdapter[]) : [];
  const extraFieldRules = Array.isArray(d.extraFieldRules) ? (d.extraFieldRules as FieldRule[]) : [];
  const packages = Array.isArray(d.packages) ? d.packages.map(validateAdapterPackage) : [];
  const minCoreVersion = typeof d.minCoreVersion === 'string' ? d.minCoreVersion : undefined;
  if (minCoreVersion && !versionAtLeast(CORE_PACKAGE_VERSION, minCoreVersion)) throw new Error(`规则要求核心版本 ${minCoreVersion}，当前为 ${CORE_PACKAGE_VERSION}`);
  for (const a of adapters) {
    if (!a || typeof a.id !== 'string' || typeof a.name !== 'string') throw new Error('适配器格式错误');
    if ('match' in a) delete (a as { match?: unknown }).match;
    validateDeclarativeMatch(a.declarativeMatch);
  }
  for (const rule of extraFieldRules) {
    if (!rule || typeof rule.field !== 'string' || !Array.isArray(rule.keywords)) throw new Error('字段规则格式错误');
  }
  for (const adapterPackage of packages) if (!versionAtLeast(CORE_PACKAGE_VERSION, adapterPackage.minCoreVersion)) throw new Error(`适配包 ${adapterPackage.id} 要求核心版本 ${adapterPackage.minCoreVersion}`);
  return { schemaVersion: 1, version: typeof d.version === 'number' ? d.version : 0, minCoreVersion, adapters, extraFieldRules, packages };
}

function validateDeclarativeMatch(raw: DeclarativeUrlMatch | undefined): void {
  if (!raw || !Array.isArray(raw.hosts) || !raw.hosts.length || raw.hosts.some((x) => typeof x !== 'string' || !x.trim())) throw new Error('适配器 URL 规则错误');
  for (const list of [raw.pathPatterns, raw.excludePathPatterns]) {
    if (list !== undefined && (!Array.isArray(list) || list.some((x) => typeof x !== 'string'))) throw new Error('适配器路径规则错误');
  }
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
    // 先写候选区并再次从序列化结果校验，确认无函数/原型数据后再原子切换。
    await chrome.storage.local.set({ [REMOTE_RULES_CANDIDATE_KEY]: rules });
    const candidateRaw = await chrome.storage.local.get(REMOTE_RULES_CANDIDATE_KEY);
    const candidate = validateRemoteRules(candidateRaw[REMOTE_RULES_CANDIDATE_KEY]);
    const current = await chrome.storage.local.get(REMOTE_RULES_KEY);
    const transaction: Record<string, unknown> = { [REMOTE_RULES_KEY]: candidate };
    if (current && current[REMOTE_RULES_KEY]) transaction[REMOTE_RULES_PREVIOUS_KEY] = current[REMOTE_RULES_KEY];
    await chrome.storage.local.set(transaction);
    await chrome.storage.local.remove(REMOTE_RULES_CANDIDATE_KEY);
    return {
      ok: true,
      message: `规则已更新：平台适配器 ${(rules.adapters || []).length} 个、学校适配包 ${(rules.packages || []).length} 个、字段规则 ${(rules.extraFieldRules || []).length} 条（重启页面后生效）`,
    };
  } catch (e) {
    try { await chrome.storage.local.remove(REMOTE_RULES_CANDIDATE_KEY); } catch { /* 忽略候选区清理失败 */ }
    return { ok: false, message: `更新失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

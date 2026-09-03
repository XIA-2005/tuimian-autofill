// 漏填高亮 · PR1 核心逻辑（绿阶段实现）
//
// 业务规则：
//   - 绿色 'filled'：path 在 filledFields 且未锁定
//   - 红色 'missing'：path 在 failedFields，或档案“真实有值”但 fillResult 未填充
//   - 黄色 'empty'  ：档案路径值为空，且 fillResult 未出现该 path
//
// 不变量：
//   - 同一 path 三色互斥
//   - 绿色 ⊆ filledFields.paths（且未锁定）
//   - 红色 ⊆ failedFields.paths ∪ {档案真实有值但未填充的 path}
//   - 黄色 ∩ fillResult.paths = ∅
//   - locked === true 的 path 不参与三色判定
import { Profile, emptyProfile, getByPath } from './profile';

export interface FillResult {
  filledFields: Array<{ path: string; value: string; driver: string }>;
  failedFields: Array<{ path: string; reason: string; driver: string }>;
  skippedFields: Array<{ path: string; reason: string }>;
}

export type FieldHighlightStatus = 'filled' | 'missing' | 'empty';

export interface HighlightMap {
  green: string[];
  yellow: string[];
  red: string[];
}

/** 单字段路径在档案里是否被显式锁定。fieldStates 缺失/空都视为未锁定。 */
function isFieldLocked(profile: Profile, path: string): boolean {
  const states = profile.fieldStates;
  if (!states || typeof states !== 'object') return false;
  const state = states[path];
  return !!(state && state.locked);
}

/** 单字段档案取值：空字符串/undefined/null 都视为空。 */
function profileValueIsEmpty(profile: Profile, path: string): boolean {
  const raw = getByPath(profile, path);
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'string') return raw.trim() === '';
  if (Array.isArray(raw)) return raw.length === 0;
  return false;
}

/**
 * 判定路径在档案里是否拥有“真实值”——
 * 即非空字符串/数组，且**不等于 emptyProfile() 的出厂默认值**。
 *
 * 为什么要排除出厂默认值？emptyProfile() 内置了一些非空常量（如 idType='居民身份证'），
 * 这些并非用户填写、不应触发“档案有值但 fillResult 未填充 → 红”的规则。
 */
function profileHasRealValue(profile: Profile, path: string): boolean {
  if (profileValueIsEmpty(profile, path)) return false;
  const def = emptyProfile();
  const cur = getByPath(profile, path);
  const baseline = getByPath(def, path);
  return cur !== baseline;
}

/** 把档案里已知的“基础字段路径”平铺成字符串数组，供黄色候选使用。 */
function knownScalarPaths(profile: Profile): string[] {
  const out: string[] = [];
  const basic = (profile && profile.basic) || {};
  for (const key of Object.keys(basic)) out.push(`basic.${key}`);
  const education = (profile && profile.education) || {};
  for (const key of Object.keys(education)) out.push(`education.${key}`);
  return out;
}

/**
 * 判单字段三色。locked 字段不参与三色判定，返回 undefined。
 *
 * 优先级：
 *   1. locked                                → undefined（不参与三色）
 *   2. failedFields 含该 path                → 'missing'（红）
 *   3. filledFields 含该 path                → 'filled'（绿）
 *   4. 档案真实有值但 fillResult 未填        → 'missing'（红）
 *   5. 档案字段为空                          → 'empty'（黄）
 */
export function classifyFieldStatus(
  path: string,
  result: FillResult,
  profile: Profile,
): FieldHighlightStatus | undefined {
  if (isFieldLocked(profile, path)) return undefined;

  const failed = (result.failedFields || []).some((f) => f && f.path === path);
  if (failed) return 'missing';

  const filled = (result.filledFields || []).some((f) => f && f.path === path);
  if (filled) return 'filled';

  if (profileHasRealValue(profile, path)) return 'missing';

  return 'empty';
}

/**
 * 把 fillResult + profile 折叠成三色 path 列表。
 *
 * 关键不变量：
 *   - 同一 path 三色互斥
 *   - 绿色 ⊆ filledFields.paths（且未锁定）
 *   - 红色 ⊆ failedFields.paths ∪ {档案真实有值但 fillResult 未填充的 path}
 *   - 黄色 ∩ fillResult.paths = ∅
 *   - locked === true 的 path 不进入任何一色
 */
export function buildHighlightMap(result: FillResult, profile: Profile): HighlightMap {
  const filledSet = new Set((result.filledFields || []).map((f) => f.path));
  const failedSet = new Set((result.failedFields || []).map((f) => f.path));
  const skippedSet = new Set((result.skippedFields || []).map((f) => f.path));
  const fillResultPaths = new Set<string>([...filledSet, ...failedSet, ...skippedSet]);

  const green: string[] = [];
  const red: string[] = [];
  const yellow: string[] = [];

  const seen = new Set<string>();
  const consider = (path: string): void => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    if (isFieldLocked(profile, path)) return; // locked：不参与三色
    if (failedSet.has(path)) {
      red.push(path);
      return;
    }
    if (filledSet.has(path)) {
      green.push(path);
      return;
    }
    if (profileHasRealValue(profile, path)) {
      // 档案真实有值但 fillResult 没填 → 红色
      red.push(path);
      return;
    }
    // 档案值为空、且 fillResult 没出现 → 黄色候选
    if (!fillResultPaths.has(path)) yellow.push(path);
  };

  for (const p of filledSet) consider(p);
  for (const p of failedSet) consider(p);
  for (const path of knownScalarPaths(profile)) consider(path);

  return { green, yellow, red };
}
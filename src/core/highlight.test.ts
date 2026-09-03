// 漏填高亮 · PR1 核心逻辑 · 红阶段测试
//
// 测试方式：本文件 export runHighlightTests() 供 test/run.ts 调用；
// 也支持独立执行 `node test/run-highlight.mjs`（见 test/run-highlight.mjs）。
//
// 铁律 3：断言用业务不变量（正则/范围/关系/互斥），不用示例值。
// 铁律 4：正常路径 / 异常路径 / 边界值 三类各 ≥ 1 case。
//
// 7 个必须覆盖的边界：
//   1. 正常路径：字段已填（绿色）
//   2. 正常路径：字段填充失败（红色）
//   3. 正常路径：字段档案为空且未参与填充（黄色）
//   4. 边界值：字段在 filledFields 和 failedFields 同时出现（应取红色）
//   5. 边界值：path 含数组下标（解析正确）
//   6. 边界值：fieldStates 为空对象（无锁定记录）
//   7. 边界值：fieldStates 中该字段 locked === true（不参与三色判定）
import { emptyProfile, Profile } from './profile';
import { buildHighlightMap, classifyFieldStatus, FillResult, HighlightMap } from './highlight';

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

export function getHighlightFailures(): string[] {
  return [...failures];
}

function check(cond: boolean, msg: string): void {
  if (cond) {
    passCount++;
    console.log('PASS: ' + msg);
  } else {
    failCount++;
    failures.push(msg);
    console.error('FAIL: ' + msg);
  }
}

/** 构造一个最小 FillResult。 */
function mkResult(overrides: Partial<FillResult> = {}): FillResult {
  return {
    filledFields: [],
    failedFields: [],
    skippedFields: [],
    ...overrides,
  };
}

/** 构造一个最小 Profile：使用 emptyProfile 起步。 */
function mkProfile(overrides: Partial<Profile> = {}): Profile {
  return { ...emptyProfile(), ...overrides };
}

/** 安全调用 classifyFieldStatus：抛错时 case 记 FAIL 并返回 undefined。 */
function safeClassify(path: string, result: FillResult, profile: Profile, msg: string): void {
  try {
    const status = classifyFieldStatus(path, result, profile);
    check(status !== undefined && status !== null, msg + ' → 未抛错，返回了值');
  } catch (_e) {
    check(false, msg + ' → 抛错（stub 未实现）');
  }
}

/** 安全调用 buildHighlightMap：抛错时 case 记 FAIL 并返回空 map。 */
function safeBuild(result: FillResult, profile: Profile): HighlightMap {
  try {
    return buildHighlightMap(result, profile);
  } catch (_e) {
    check(false, 'buildHighlightMap → 抛错（stub 未实现）');
    return { green: [], yellow: [], red: [] };
  }
}

// ============================================================================
// classifyFieldStatus 测试（7 个边界 case）
// ============================================================================

export function runHighlightTests(): void {
  console.log('\n=== highlight PR1 · 红阶段测试 ===');

  // ---- 1. 正常路径：字段已填 → 绿色（filled） ----
  {
    const profile = mkProfile();
    const result = mkResult({ filledFields: [{ path: 'basic.name', value: 'X', driver: 'rule:basic.name' }] });
    try {
      const status = classifyFieldStatus('basic.name', result, profile);
      check(status === 'filled', 'classifyFieldStatus 正常：字段在 filledFields 且未锁定 → filled');
    } catch (_e) {
      check(false, 'classifyFieldStatus 正常：字段在 filledFields 且未锁定 → filled（抛错）');
    }
  }

  // ---- 2. 正常路径：字段填充失败 → 红色（missing） ----
  {
    const profile = mkProfile();
    const result = mkResult({ failedFields: [{ path: 'basic.idCard', reason: 'pattern-mismatch', driver: 'rule:basic.idCard' }] });
    try {
      const status = classifyFieldStatus('basic.idCard', result, profile);
      check(status === 'missing', 'classifyFieldStatus 正常：字段在 failedFields → missing');
    } catch (_e) {
      check(false, 'classifyFieldStatus 正常：字段在 failedFields → missing（抛错）');
    }
  }

  // ---- 3. 正常路径：档案为空且未参与填充 → 黄色（empty） ----
  {
    const profile = mkProfile(); // basic.email 默认 ''
    const result = mkResult();
    try {
      const status = classifyFieldStatus('basic.email', result, profile);
      check(status === 'empty', 'classifyFieldStatus 正常：档案字段为空、fillResult 无该 path → empty');
    } catch (_e) {
      check(false, 'classifyFieldStatus 正常：档案字段为空、fillResult 无该 path → empty（抛错）');
    }
  }

  // ---- 4. 边界值：filledFields + failedFields 同时出现 → 红色优先（missing 覆盖 filled） ----
  {
    const profile = mkProfile();
    const result = mkResult({
      filledFields: [{ path: 'basic.phone', value: 'X', driver: 'rule:basic.phone' }],
      failedFields: [{ path: 'basic.phone', reason: 'value-rejected-by-component', driver: 'rule:basic.phone' }],
    });
    try {
      const status = classifyFieldStatus('basic.phone', result, profile);
      check(status === 'missing', 'classifyFieldStatus 边界：filled+failed 同 path → missing（红色优先）');
    } catch (_e) {
      check(false, 'classifyFieldStatus 边界：filled+failed 同 path → missing（抛错）');
    }
  }

  // ---- 5. 边界值：path 含数组下标（awards[0].name） ----
  {
    const profile = mkProfile();
    const result = mkResult({ filledFields: [{ path: 'awards[0].name', value: 'X', driver: 'compose:awards' }] });
    try {
      const status = classifyFieldStatus('awards[0].name', result, profile);
      check(status === 'filled', 'classifyFieldStatus 边界：数组下标 path 解析正确 → filled');
    } catch (_e) {
      check(false, 'classifyFieldStatus 边界：数组下标 path 解析正确 → filled（抛错）');
    }
  }
  {
    const profile = mkProfile();
    const result = mkResult({ failedFields: [{ path: 'awards[0].name', reason: 'row-not-found', driver: 'compose:awards' }] });
    try {
      const status = classifyFieldStatus('awards[0].name', result, profile);
      check(status === 'missing', 'classifyFieldStatus 边界：数组下标 path 解析正确 → missing');
    } catch (_e) {
      check(false, 'classifyFieldStatus 边界：数组下标 path 解析正确 → missing（抛错）');
    }
  }

  // ---- 6. 边界值：fieldStates 为空对象（无锁定记录）→ 仍能正常三色判定 ----
  {
    const profile = mkProfile();
    profile.fieldStates = {}; // 显式清空，模拟新建档案
    const result = mkResult({ filledFields: [{ path: 'basic.name', value: 'X', driver: 'rule:basic.name' }] });
    try {
      const status = classifyFieldStatus('basic.name', result, profile);
      check(status === 'filled', 'classifyFieldStatus 边界：fieldStates 空对象 → 按未锁定判定（filled）');
    } catch (_e) {
      check(false, 'classifyFieldStatus 边界：fieldStates 空对象 → 按未锁定判定（抛错）');
    }
  }

  // ---- 7. 边界值：fieldStates[path].locked === true → 不参与三色判定 ----
  //     业务不变量：locked 字段不进入 green/red/yellow 三色列表。
  //     classifyFieldStatus 对 locked 字段应返回 null/undefined，绿阶段才可返回。
  {
    const profile = mkProfile();
    profile.fieldStates['basic.name'] = {
      locked: true, source: 'manual', updatedAt: new Date().toISOString(), confidence: 'verified',
    };
    const result = mkResult({ filledFields: [{ path: 'basic.name', value: 'X', driver: 'rule:basic.name' }] });
    try {
      const status = classifyFieldStatus('basic.name', result, profile);
      check(
        status === null || status === undefined,
        'classifyFieldStatus 边界：locked 字段不参与三色判定（返回 null/undefined）',
      );
    } catch (_e) {
      check(false, 'classifyFieldStatus 边界：locked 字段不参与三色判定（抛错）');
    }
  }

  // ============================================================================
  // buildHighlightMap 测试
  // ============================================================================
  // ---- 不变量验证：green / yellow / red 三色互斥 ----
  {
    const profile = mkProfile();
    const result = mkResult({
      filledFields: [
        { path: 'basic.name', value: 'X', driver: 'rule:basic.name' },
        { path: 'basic.phone', value: 'X', driver: 'rule:basic.phone' },
      ],
      failedFields: [
        { path: 'basic.idCard', reason: 'pattern-mismatch', driver: 'rule:basic.idCard' },
      ],
    });
    const map = safeBuild(result, profile);
    const all = [...map.green, ...map.yellow, ...map.red];
    const unique = new Set(all);
    check(unique.size === all.length, 'buildHighlightMap 不变量：green/yellow/red 三色互斥（无 path 重复）');
  }

  {
    const profile = mkProfile();
    const result = mkResult({
      filledFields: [
        { path: 'basic.name', value: 'X', driver: 'rule:basic.name' },
        { path: 'basic.phone', value: 'X', driver: 'rule:basic.phone' },
      ],
      failedFields: [
        { path: 'basic.idCard', reason: 'pattern-mismatch', driver: 'rule:basic.idCard' },
      ],
    });
    const map = safeBuild(result, profile);
    // 业务规则 1：green ⊆ filledFields.paths
    check(
      map.green.every((p) => result.filledFields.some((f) => f.path === p)),
      'buildHighlightMap 不变量：green ⊆ filledFields.paths',
    );
  }

  {
    const profile = mkProfile();
    const result = mkResult({
      filledFields: [
        { path: 'basic.name', value: 'X', driver: 'rule:basic.name' },
      ],
      failedFields: [
        { path: 'basic.idCard', reason: 'pattern-mismatch', driver: 'rule:basic.idCard' },
      ],
    });
    const map = safeBuild(result, profile);
    // 业务规则 2：red ⊆ failedFields.paths
    check(
      map.red.every((p) => result.failedFields.some((f) => f.path === p)),
      'buildHighlightMap 不变量：red ⊆ failedFields.paths',
    );
  }

  {
    const profile = mkProfile();
    const result = mkResult({
      filledFields: [
        { path: 'basic.name', value: 'X', driver: 'rule:basic.name' },
      ],
    });
    const map = safeBuild(result, profile);
    // 业务规则 3：yellow ∩ fillResult.paths = ∅
    const resultPaths = new Set([
      ...result.filledFields.map((f) => f.path),
      ...result.failedFields.map((f) => f.path),
      ...result.skippedFields.map((f) => f.path),
    ]);
    check(
      map.yellow.every((p) => !resultPaths.has(p)),
      'buildHighlightMap 不变量：yellow ∩ fillResult.paths = ∅',
    );
  }

  // ---- 边界：locked 字段不进入任何颜色 ----
  {
    const profile = mkProfile();
    profile.fieldStates['basic.name'] = {
      locked: true, source: 'manual', updatedAt: new Date().toISOString(), confidence: 'verified',
    };
    const result = mkResult({
      filledFields: [
        { path: 'basic.name', value: 'X', driver: 'rule:basic.name' }, // locked：不应进 green
        { path: 'basic.phone', value: 'X', driver: 'rule:basic.phone' }, // 未锁定：应进 green
      ],
    });
    const map = safeBuild(result, profile);
    check(!map.green.includes('basic.name'), 'buildHighlightMap 边界：locked 字段不进入 green');
    check(!map.yellow.includes('basic.name'), 'buildHighlightMap 边界：locked 字段不进入 yellow');
    check(!map.red.includes('basic.name'), 'buildHighlightMap 边界：locked 字段不进入 red');
  }

  // ---- 边界：档案有值但 fillResult 未填充 → 红色（识别了但推导失败）----
  {
    const profile = mkProfile();
    profile.basic.idCard = '210211200305011233'; // 档案有值
    const result = mkResult(); // fillResult 完全没有 basic.idCard
    const map = safeBuild(result, profile);
    check(
      map.red.includes('basic.idCard'),
      'buildHighlightMap 边界：档案有值但 fillResult 未填充 → red（识别了但推导失败）',
    );
  }

  // ---- 边界：filled + failed 同 path → red 优先 ----
  {
    const profile = mkProfile();
    const result = mkResult({
      filledFields: [{ path: 'basic.phone', value: 'X', driver: 'rule:basic.phone' }],
      failedFields: [{ path: 'basic.phone', reason: 'value-rejected', driver: 'rule:basic.phone' }],
    });
    const map = safeBuild(result, profile);
    check(map.red.includes('basic.phone'), 'buildHighlightMap 边界：filled+failed 同 path → red 优先');
    check(!map.green.includes('basic.phone'), 'buildHighlightMap 边界：filled+failed 同 path → 不进 green');
  }

  // ---- 边界：path 含数组下标 awards[0].name ----
  {
    const profile = mkProfile();
    const result = mkResult({
      filledFields: [
        { path: 'awards[0].name', value: 'X', driver: 'compose:awards' },
        { path: 'awards[1].name', value: 'X', driver: 'compose:awards' },
      ],
    });
    const map = safeBuild(result, profile);
    check(
      map.green.includes('awards[0].name') && map.green.includes('awards[1].name'),
      'buildHighlightMap 边界：数组下标 path 正确归类（green）',
    );
  }

  // ---- 汇总 ----
  console.log(`\nhighlight 用例：${passCount} PASS, ${failCount} FAIL`);
  if (failCount > 0) {
    console.error('失败列表：');
    for (const f of failures) console.error('  - ' + f);
  }
}

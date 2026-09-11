// v8 J02 旧诊断迁移与回执边界测试(PLAN v8 · J02)。
// 目标:旧持久化遥测/摘要必须按当前 schema 重建;每个隐私标记独立验证;回执边界正确。
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { restoreFillTelemetryState, createFillTelemetryState, reduceFillTelemetry, buildDiagnosticSummary, sanitizeDiagnosticValue, fixedFieldLabel } from './fill-telemetry';
import { RunAggregator } from '../background/aggregation';

const failures: string[] = [];
function test(name: string, cond: boolean, detail?: unknown): void {
  if (cond) return;
  failures.push(detail === undefined ? name : `${name} :: ${JSON.stringify(detail)}`);
}

/** 功能:构造带隐私标记的旧版持久化遥测(模拟加固前落盘的数据)。 */
function legacyTelemetry(marker: string, field: string): string {
  return JSON.stringify({
    runId: 'legacy-run',
    startedAt: 1,
    updatedAt: 2,
    stage: 'filling',
    title: marker,
    detail: marker,
    currentLabel: marker,
    unknownField: marker,
    counts: { total: 3, completed: 2, filled: 2, skipped: 0, failed: 0, waiting: 1, PRIVATE_STATS: marker },
    progress: { current: 2, total: 3 },
    events: [
      { runId: 'legacy-run', sequence: 1, timestamp: 2, stage: 'filling', level: 'success', action: marker, targetLabel: marker, field, reason: marker, issueCode: marker, PRIVATE_KEY: marker },
      { runId: 'legacy-run', sequence: 2, timestamp: 2, stage: 'filling', level: 'success', action: '已填写并回读通过', targetLabel: '手机号', field: 'basic.phone', reason: '写入或回读失败' },
    ],
  });
}

interface VmHarness {
  handler?: (msg: unknown, sender: unknown, respond: (r: unknown) => void) => void;
  timers: Array<{ fn: () => void; ms: number }>;
  messages: unknown[][];
}

function loadBackground(): VmHarness {
  const source = buildSync({ entryPoints: ['src/background/index.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const harness: VmHarness = { timers: [], messages: [] };
  vm.runInNewContext(source, {
    console,
    crypto: require('node:crypto').webcrypto,
    setTimeout: (fn: () => void, ms: number) => { harness.timers.push({ fn, ms }); return harness.timers.length; },
    clearTimeout: () => undefined,
    chrome: {
      runtime: { onInstalled: { addListener: () => undefined }, onMessage: { addListener: (fn: VmHarness['handler']) => { harness.handler = fn; } } },
      tabs: { sendMessage: async (...args: unknown[]) => { harness.messages.push(args); } },
    },
  });
  return harness;
}

const EMPTY_STATS = { total: 0, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 };

/** 功能:完成一轮并返回 runId(用于回执边界场景)。 */
function completeRound(h: VmHarness, tabId: number, docId = 'doc-0'): string {
  h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: tabId } }, () => undefined);
  const runId = (h.messages[0][1] as { runId: string }).runId;
  h.messages.length = 0;
  h.handler?.({ type: 'FILL_REGISTER', runId, docId }, { tab: { id: tabId }, frameId: 0 }, () => undefined);
  h.handler?.({ type: 'FILL_TERMINAL', runId, docId, frameSeq: 1, stats: { ...EMPTY_STATS, total: 1, filled: 1 }, items: [] }, { tab: { id: tabId }, frameId: 0 }, () => undefined);
  const seal = [...h.timers].reverse().find((t) => t.ms === 700);
  if (seal) { const idx = h.timers.indexOf(seal); h.timers.splice(idx, 1); seal.fn(); }
  h.messages.length = 0;
  return runId;
}

export function runV8MigrationTests(): void {
  // J02.3:每个隐私标记独立验证(短中文姓名、短英文姓名、纯 ASCII 令牌、对象键、path/query、stats 扩展)。
  const cases: Array<{ name: string; marker: string }> = [
    { name: '短中文姓名', marker: '张三' },
    { name: '短英文姓名', marker: 'Alice' },
    { name: '纯ASCII令牌', marker: 'ASCII_PRIVATE_TOKEN' },
    { name: '对象键', marker: 'PRIVATE_KEY' },
    { name: 'path令牌', marker: '/private/path/secret' },
    { name: 'query令牌', marker: '?token=PRIVATE_QUERY_9f3a' },
    { name: 'stats扩展', marker: 'PRIVATE_STATS' },
    { name: '地址', marker: '西安市雁塔区测试路1号' },
    { name: '论文标题', marker: '基于深度学习的脱敏论文标题' },
  ];
  for (const { name, marker } of cases) {
    const restored = restoreFillTelemetryState(legacyTelemetry(marker, 'basic.name'), 3);
    const json = JSON.stringify(restored);
    test(`J02-旧遥测不含${name}`, !json.includes(marker), { marker, json: json.slice(0, 200) });
    // 旧字段不得原样带回:title/detail 由已校验事件重建。
    test(`J02-${name}场景仍保留合法计数`, restored?.counts.total === 3 && restored?.counts.filled === 2, { counts: restored?.counts });
  }
  // 合法事件保留:固定动作、固定字段标签、问题码、固定原因。
  {
    const restored = restoreFillTelemetryState(legacyTelemetry('SYNTH', 'basic.name'), 3);
    const second = restored?.events[1];
    test('J02-旧遥测保留合法固定动作', second?.action === '已填写并回读通过', { second });
    test('J02-旧遥测保留固定字段标签', second?.targetLabel === fixedFieldLabel('basic.phone') && second?.field === 'basic.phone', { second });
    test('J02-旧遥测原因按固定模板重建', /写入或回读失败/.test(String(second?.reason || '')) && !String(second?.reason || '').includes('SYNTH'), { reason: second?.reason });
    test('J02-旧遥测未知问题码被丢弃', !JSON.stringify(restored).includes('PRIVATE_KEY'), {});
  }
  // 未知字段/未知键/旧URL不得原样带回。
  {
    const raw = JSON.stringify({ runId: 'r', updatedAt: 2, stage: 'filling', counts: { total: 1 }, events: [], extra: 'PRIVATE_EXTRA', url: 'https://private.example/secret?token=abc' });
    const restored = restoreFillTelemetryState(raw, 3);
    const json = JSON.stringify(restored);
    test('J02-未知顶层键与URL不恢复', !json.includes('PRIVATE_EXTRA') && !json.includes('private.example') && !('extra' in (restored as object)), { json });
  }
  // 结构不合法/过期:不恢复(不把坏数据当空状态混入)。
  {
    test('J02-缺runId不恢复', restoreFillTelemetryState(JSON.stringify({ events: [] }), 3) === null);
    test('J02-过期不恢复', restoreFillTelemetryState(legacyTelemetry('x', 'basic.name'), 31 * 60_000) === null);
    test('J02-坏JSON不恢复', restoreFillTelemetryState('{not-json', 3) === null);
  }
  // J02.1b:摘要迁移同样按当前 schema(旧摘要里的资料字段不得带回)。
  {
    const legacySummary = JSON.stringify({
      at: 1,
      stats: { total: 2, filled: 1 },
      profileLists: { name: '张三', awards: ['真实奖项名称'] },
      items: [{ label: '张三', field: 'basic.name', status: 'filled', value: '张三', reason: '真实原因', issue: 'E1103' }],
    });
    const summary = buildDiagnosticSummary(JSON.parse(legacySummary));
    const json = JSON.stringify(summary);
    test('J02-旧摘要不含资料', !json.includes('张三') && !json.includes('真实奖项名称') && !json.includes('真实原因') && !json.includes('profileLists'), { json });
    test('J02-旧摘要保留问题码', summary?.items[0].issue === 'E1103' && summary?.items[0].field === 'basic.name' && summary?.items[0].label === fixedFieldLabel('basic.name'), { items: summary?.items });
  }
  // J02.2:每条新写入的出口仍按同一 schema(回归锚点)。
  {
    const state = reduceFillTelemetry(createFillTelemetryState(1), { stage: 'filling', level: 'success', action: 'PRIVATE_ACTION', targetLabel: '张三', field: 'basic.name', reason: 'Alice' });
    const json = JSON.stringify(state);
    test('J02-新出口同样按schema', !json.includes('PRIVATE_ACTION') && !json.includes('张三') && !json.includes('Alice'), { json: json.slice(0, 200) });
    test('J02-未知action回落固定文案', state.events[0].action === '填写状态更新', { action: state.events[0].action });
  }
  // 清洗器对独立标记同样生效(不依赖中文字符串混排)。
  {
    for (const { name, marker } of cases) {
      const safe = sanitizeDiagnosticValue({ v: marker, nested: [marker] });
      test(`J02-清洗器独立拒绝${name}`, !JSON.stringify(safe).includes(marker), { safe });
    }
  }

  // J02.4 回执边界:已覆盖区域重复注册不误报未覆盖。
  {
    const h = loadBackground();
    const runId = completeRound(h, 31);
    const responds: unknown[] = [];
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-0' }, { tab: { id: 31 }, frameId: 0 }, (r) => responds.push(r));
    const r = responds[0] as { ok?: boolean; reason?: string; covered?: boolean } | undefined;
    test('J02-已覆盖区域重复注册不误报', r?.reason === 'already-completed' && r?.covered === true, r);
  }
  // 活动轮:封口后按"新区域"计数,同一区域重复注册不重复计数。
  {
    const h = loadBackground();
    h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: 32 } }, () => undefined);
    const runId = (h.messages[0][1] as { runId: string }).runId;
    h.messages.length = 0;
    const seal = [...h.timers].reverse().find((t) => t.ms === 700);
    if (seal) { h.timers.splice(h.timers.indexOf(seal), 1); seal.fn(); }
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-a' }, { tab: { id: 32 }, frameId: 1 }, () => undefined);
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-a' }, { tab: { id: 32 }, frameId: 1 }, () => undefined); // 同区域重复
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-b' }, { tab: { id: 32 }, frameId: 2 }, () => undefined); // 新区域
    h.handler?.({ type: 'FILL_TERMINAL', runId, docId: 'doc-a', frameSeq: 1, stats: { ...EMPTY_STATS, total: 1, filled: 1 }, items: [] }, { tab: { id: 32 }, frameId: 1 }, () => undefined);
    h.handler?.({ type: 'FILL_TERMINAL', runId, docId: 'doc-b', frameSeq: 1, stats: { ...EMPTY_STATS, total: 1, filled: 1 }, items: [] }, { tab: { id: 32 }, frameId: 2 }, () => undefined);
    const done = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_DONE').map((m) => m[1] as { lateRegistrations?: number; participants?: number }).pop();
    test('J02-活动轮新区域计数不重复', done?.lateRegistrations === 2 && done?.participants === 2, done);
  }
  // 容量满:明确降级(返回 capacity),不反复刷通知。
  {
    const h = loadBackground();
    const first = completeRound(h, 33);
    for (let i = 0; i < 8; i += 1) completeRound(h, 33);
    const responds: unknown[] = [];
    h.handler?.({ type: 'FILL_REGISTER', runId: first, docId: 'doc-old' }, { tab: { id: 33 }, frameId: 1 }, (r) => responds.push(r));
    test('J02-容量淘汰后按未知轮拒绝', (responds[0] as { reason?: string } | undefined)?.reason === 'unknown-run', responds[0]);
  }
  // 终态即最终:取消/超时后的更高 seq 不改变汇总(与 J00 同语义)。
  {
    const g = new RunAggregator('R');
    g.register(0, 'doc');
    g.terminalize({ runId: 'R', frameId: 0, docId: 'doc', frameSeq: 2, stats: { ...EMPTY_STATS, total: 2, filled: 2 }, items: [], terminalKind: 'cancelled' });
    test('J02-取消终态后迟到结果被拒', g.accept({ runId: 'R', frameId: 0, docId: 'doc', frameSeq: 5, stats: { ...EMPTY_STATS, total: 2, failed: 2 }, items: [] }) === false);
  }
}

export function getV8MigrationFailures(): string[] {
  return failures;
}

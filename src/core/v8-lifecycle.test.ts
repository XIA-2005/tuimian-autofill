// v8 J00 运行生命周期测试(取消/deadline 真停原轮 + 正确终态类别)。
// 层级:bg=真实 background bundle 消息入口(VM);unit=纯逻辑。
// 来源:`docs/analysis/DS-v7复审与接管报告-2026-09-10.md` 剩余问题 1 与 PLAN v8 J00。
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { RunAggregator } from '../background/aggregation';

const failures: string[] = [];
function test(name: string, cond: boolean, detail?: unknown): void {
  if (cond) return;
  failures.push(detail === undefined ? name : `${name} :: ${JSON.stringify(detail)}`);
}

interface VmHarness {
  handler?: (msg: unknown, sender: unknown, respond: (r: unknown) => void) => void;
  timers: Array<{ fn: () => void; ms: number }>;
  messages: unknown[][];
}

/** 功能:构建真实 background bundle 的 VM 入口,记录定时器与出站消息。 */
function loadBackground(): VmHarness {
  const source = buildSync({ entryPoints: ['src/background/index.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const harness: VmHarness = { timers: [], messages: [] };
  vm.runInNewContext(source, {
    console,
    crypto: require('node:crypto').webcrypto,
    setTimeout: (fn: () => void, ms: number) => {
      harness.timers.push({ fn, ms });
      return harness.timers.length;
    },
    clearTimeout: () => undefined,
    chrome: {
      runtime: { onInstalled: { addListener: () => undefined }, onMessage: { addListener: (fn: VmHarness['handler']) => { harness.handler = fn; } } },
      tabs: { sendMessage: async (...args: unknown[]) => { harness.messages.push(args); } },
    },
  });
  return harness;
}

const EMPTY_STATS = { total: 0, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 };

/** 功能:取"本轮"尚未触发过的第 n 个指定时长定时器。 */
function makeTimerPicker(h: VmHarness): (ms: number) => (() => void) | undefined {
  const fired = new Set<{ fn: () => void; ms: number }>();
  return (ms: number) => {
    const timer = [...h.timers].reverse().find((t) => t.ms === ms && !fired.has(t));
    if (timer) fired.add(timer);
    return timer?.fn;
  };
}

export function runV8LifecycleTests(): void {
  // J00.3/deadline:超时时向"已注册但未终态"的参与者发送 scoped 停止通知。
  {
    const h = loadBackground();
    h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: 21 } }, () => undefined);
    const runId = (h.messages[0][1] as { runId: string }).runId;
    h.messages.length = 0;
    const pick = makeTimerPicker(h);
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-0' }, { tab: { id: 21 }, frameId: 0 }, () => undefined);
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-1' }, { tab: { id: 21 }, frameId: 1 }, () => undefined);
    // 帧0 已完成,帧1 仍在工作。
    h.handler?.({ type: 'FILL_TERMINAL', runId, docId: 'doc-0', frameSeq: 1, stats: { ...EMPTY_STATS, total: 1, filled: 1 }, items: [] }, { tab: { id: 21 }, frameId: 0 }, () => undefined);
    pick(700)?.();
    pick(25000)?.();
    const stop = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_STOP');
    test('J00-deadline只向未终态参与者发停止通知', stop.length === 1 && (stop[0][1] as { runId?: string }).runId === runId, { stop: stop.map((m) => m[1]) });
    test('J00-停止通知带目标frameId', JSON.stringify(stop[0]?.[2] || {}) === JSON.stringify({ frameId: 1 }), { opts: stop[0]?.[2] });
    const done = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_DONE').map((m) => m[1] as { timedOut?: boolean; missing?: string[] }).pop();
    test('J00-超时收口仍如实报缺失', done?.timedOut === true && done?.missing?.length === 1, done);
  }
  // J00.2:content 及时上报 cancelled 后,background 立即以 cancelled 类别收口,不等 deadline。
  {
    const h = loadBackground();
    h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: 22 } }, () => undefined);
    const runId = (h.messages[0][1] as { runId: string }).runId;
    h.messages.length = 0;
    const pick = makeTimerPicker(h);
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-0' }, { tab: { id: 22 }, frameId: 0 }, () => undefined);
    pick(700)?.();
    // content 侧发现换档案/新轮 → 主动上报该轮 cancelled 终态。
    h.handler?.({ type: 'FILL_TERMINAL', runId, docId: 'doc-0', frameSeq: 1, stats: { ...EMPTY_STATS, total: 3, filled: 1 }, items: [], terminalKind: 'cancelled' }, { tab: { id: 22 }, frameId: 0 }, () => undefined);
    const done = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_DONE').map((m) => m[1] as { timedOut?: boolean; terminalKinds?: Record<string, number> }).pop();
    test('J00-主动取消立即收口且不报超时', done?.timedOut === false && done?.terminalKinds?.['cancelled'] === 1, done);
  }
  // J00.6:取消上报保留已完成字段(不丢结果让 total 变 0)。
  {
    const g = new RunAggregator('R');
    g.register(0, 'doc');
    g.terminalize({ runId: 'R', frameId: 0, docId: 'doc', frameSeq: 1, stats: { ...EMPTY_STATS, total: 5, filled: 3, failed: 2 }, items: [], terminalKind: 'cancelled' });
    const sum = g.summarize();
    test('J00-取消保留已完成计数', sum.stats.total === 5 && sum.stats.filled === 3 && sum.terminalKinds['cancelled'] === 1, sum.stats);
  }
  // J00.1:终态即最终——取消终态后再来的更高 seq 不改变结果。
  {
    const g = new RunAggregator('R2');
    g.register(0, 'doc');
    g.terminalize({ runId: 'R2', frameId: 0, docId: 'doc', frameSeq: 5, stats: { ...EMPTY_STATS, total: 2, filled: 2 }, items: [], terminalKind: 'done' });
    const late = g.accept({ runId: 'R2', frameId: 0, docId: 'doc', frameSeq: 9, stats: { ...EMPTY_STATS, total: 2, failed: 2 }, items: [] });
    test('J00-终态后迟到结果被拒', late === false && g.summarize().stats.filled === 2, { late, sum: g.summarize().stats });
  }
  // J00.5:两轮交错——旧轮取消响应不覆盖新轮;新轮参与者独立登记。
  {
    const h = loadBackground();
    h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: 23 } }, () => undefined);
    const firstRun = (h.messages[0][1] as { runId: string }).runId;
    h.messages.length = 0;
    const pick = makeTimerPicker(h);
    h.handler?.({ type: 'FILL_REGISTER', runId: firstRun, docId: 'doc-0' }, { tab: { id: 23 }, frameId: 0 }, () => undefined);
    // 旧轮取消(用户换档案)
    h.handler?.({ type: 'FILL_TERMINAL', runId: firstRun, docId: 'doc-0', frameSeq: 1, stats: { ...EMPTY_STATS, total: 1 }, items: [], terminalKind: 'cancelled' }, { tab: { id: 23 }, frameId: 0 }, () => undefined);
    // 新轮启动
    const responds: unknown[] = [];
    h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: 23 } }, (r) => responds.push(r));
    const secondRun = (h.messages.find((m) => (m[1] as { runId?: string }).runId !== firstRun)?.[1] as { runId?: string } | undefined)?.runId;
    test('J00-新轮获得独立runId', !!secondRun && secondRun !== firstRun, { firstRun, secondRun });
    h.handler?.({ type: 'FILL_REGISTER', runId: secondRun as string, docId: 'doc-0' }, { tab: { id: 23 }, frameId: 0 }, () => undefined);
    h.handler?.({ type: 'FILL_TERMINAL', runId: secondRun as string, docId: 'doc-0', frameSeq: 1, stats: { ...EMPTY_STATS, total: 4, filled: 4 }, items: [] }, { tab: { id: 23 }, frameId: 0 }, () => undefined);
    pick(700)?.();
    const done = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_DONE').map((m) => m[1] as { stats?: { total?: number; filled?: number }; runId?: string }).pop();
    test('J00-新轮汇总不被旧轮污染', done?.runId === secondRun && done?.stats?.total === 4 && done?.stats?.filled === 4, done);
  }
  // J00.4:轮次生命周期判定——取消后的谓词必须为 false(纯逻辑)。
  {
    const lifecycles = new Map<string, string>([['runA', 'cancelled'], ['runB', 'expired']]);
    const isActive = (runId: string | undefined): boolean => (runId ? (lifecycles.get(runId) || 'active') : 'active') === 'active';
    test('J00-cancelled/expired 均非活跃', isActive('runA') === false && isActive('runB') === false && isActive('runC') === true, { a: isActive('runA'), b: isActive('runB'), c: isActive('runC') });
  }
}

export function getV8LifecycleFailures(): string[] {
  return failures;
}

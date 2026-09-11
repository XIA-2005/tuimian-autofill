// v7 审查反例自动测试(PLAN v7 · I00 运行生命周期)
// 来源:docs/analysis/codex-v6-review-2026-09-10/ 的复审 C05/C08 与 PLAN v7 I00。
// 原则:使用真实 background bundle 的消息入口在 VM 中验证协议序(与真实浏览器多 frame 测试互补)。
import { buildSync } from 'esbuild';
import vm from 'node:vm';

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

function stats(filled: number): typeof EMPTY_STATS {
  return { ...EMPTY_STATS, total: filled, filled };
}

/** 功能:驱动一轮完整填充并收口,返回 runId 与收口前记录的消息数。 */
function completeRound(h: VmHarness, tabId: number, docId = 'doc-0'): string {
  const responds: unknown[] = [];
  h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: tabId } }, (r) => responds.push(r));
  const runId = (h.messages[0][1] as { runId: string }).runId;
  h.messages.length = 0; // 丢弃 FILL 广播,只观察后续回执
  h.handler?.({ type: 'FILL_REGISTER', runId, docId }, { tab: { id: tabId }, frameId: 0 }, () => undefined);
  h.handler?.({ type: 'FILL_TERMINAL', runId, docId, frameSeq: 1, stats: stats(1), items: [] }, { tab: { id: tabId }, frameId: 0 }, () => undefined);
  // 触发"本轮"的封口定时器(取尚未触发过的最后一个 700ms 定时器)。
  const seal = [...h.timers].reverse().find((t) => t.ms === 700 && !firedTimers.has(t));
  if (seal) {
    firedTimers.add(seal);
    seal.fn();
  }
  h.messages.length = 0;
  return runId;
}

const firedTimers = new Set<{ fn: () => void; ms: number }>();

export function runV7LifecycleTests(): void {
  // 复审：完成轮的原参与者重试注册，不是一个新的“未覆盖”区域。
  {
    const h = loadBackground();
    const runId = completeRound(h, 80);
    let response: unknown;
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-0' }, { tab: { id: 80 }, frameId: 0 }, (r) => { response = r; });
    test('v8-已覆盖区域重复注册不误报未覆盖', (response as { covered?: boolean })?.covered === true && h.messages.length === 0, response);
    for (let i = 1; i <= 32; i++) h.handler?.({ type: 'FILL_REGISTER', runId, docId: `late-${i}` }, { tab: { id: 80 }, frameId: i }, () => undefined);
    const count = h.messages.length;
    for (let i = 0; i < 3; i++) h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'overflow' }, { tab: { id: 80 }, frameId: 99 }, (r) => { response = r; });
    test('v8-回执满容量后不重复刷通知', h.messages.length === count && (response as { reason?: string })?.reason === 'receipt-capacity', response);
  }
  // 复审：活动轮封口后的重复注册只按新区域计一次。
  {
    const h = loadBackground();
    h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: 81 } }, () => undefined);
    const runId = (h.messages[0][1] as { runId: string }).runId;
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'top' }, { tab: { id: 81 }, frameId: 0 }, () => undefined);
    h.timers.find((timer) => timer.ms === 700)?.fn();
    for (let i = 0; i < 2; i++) h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'child' }, { tab: { id: 81 }, frameId: 1 }, () => undefined);
    for (const [frameId, docId] of [[0, 'top'], [1, 'child']] as const) h.handler?.({ type: 'FILL_TERMINAL', runId, docId, frameSeq: 1, stats: stats(1), items: [] }, { tab: { id: 81 }, frameId }, () => undefined);
    const done = h.messages.find((message) => (message[1] as { type: string }).type === 'FILL_DONE')?.[1] as { lateRegistrations?: number };
    test('v8-活动轮晚注册按区域去重', done?.lateRegistrations === 1, done);
  }
  // I00:收口后到达的注册必须得到明确"未覆盖"回执,并让顶层可见。
  {
    const h = loadBackground();
    const runId = completeRound(h, 9);
    const responds: unknown[] = [];
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-late' }, { tab: { id: 9 }, frameId: 1 }, (r) => responds.push(r));
    const receipt = responds[0] as { ok?: boolean; reason?: string; covered?: boolean; lateRegions?: number } | undefined;
    test('I00-收口后注册得到未覆盖回执', receipt?.ok === false && receipt?.reason === 'run-completed' && receipt?.covered === false && receipt?.lateRegions === 1, receipt);
    const notice = h.messages.find((m) => (m[1] as { type: string }).type === 'FILL_ROUND_NOTICE')?.[1] as { lateRegions?: number; message?: string } | undefined;
    const late = h.messages.find((m) => (m[1] as { type: string }).type === 'FILL_LATE_REGISTRATION')?.[1] as { message?: string } | undefined;
    test('I00-顶层收到未覆盖区域提示', notice?.lateRegions === 1 && /未计入本轮/.test(String(notice?.message || '')), notice);
    test('I00-该区域收到明确未覆盖告知', /未计入本轮/.test(String(late?.message || '')), late);
  }
  // I00:同一区域重复晚注册不重复计数、不重复提示。
  {
    const h = loadBackground();
    const runId = completeRound(h, 10);
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-late' }, { tab: { id: 10 }, frameId: 1 }, () => undefined);
    const afterFirst = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_ROUND_NOTICE').length;
    h.messages.length = 0;
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-late' }, { tab: { id: 10 }, frameId: 1 }, () => undefined);
    const afterSecond = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_ROUND_NOTICE').length;
    test('I00-重复晚注册不重复计数', afterFirst === 1 && afterSecond === 0, { afterFirst, afterSecond });
    // 另一个区域晚注册 → 计数递增到 2
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-late-2' }, { tab: { id: 10 }, frameId: 2 }, () => undefined);
    const notice2 = h.messages.find((m) => (m[1] as { type: string }).type === 'FILL_ROUND_NOTICE')?.[1] as { lateRegions?: number } | undefined;
    test('I00-按新区域递增计数', notice2?.lateRegions === 2, notice2);
  }
  // I00:未知轮(无回执)的注册被明确拒绝,不重开已收口轮。
  {
    const h = loadBackground();
    const runId = completeRound(h, 11);
    const responds: unknown[] = [];
    h.handler?.({ type: 'FILL_REGISTER', runId: 'run_unknown', docId: 'doc-x' }, { tab: { id: 11 }, frameId: 1 }, (r) => responds.push(r));
    test('I00-未知轮注册被拒绝', (responds[0] as { reason?: string } | undefined)?.reason === 'unknown-run', responds[0]);
    // 已收口轮不会因晚注册重新开始统计
    h.handler?.({ type: 'FILL_RESULT', runId, docId: 'doc-late', frameSeq: 1, stats: stats(5), items: [] }, { tab: { id: 11 }, frameId: 1 }, () => undefined);
    const doneAgain = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_DONE').length;
    test('I00-收口后结果不重开统计', doneAgain === 0, { doneAgain });
  }
  // I00:回执有界(容量上限)——最早的轮次回执被淘汰后按未知轮拒绝。
  {
    const h = loadBackground();
    const first = completeRound(h, 12);
    for (let i = 0; i < 8; i += 1) completeRound(h, 12);
    const responds: unknown[] = [];
    h.handler?.({ type: 'FILL_REGISTER', runId: first, docId: 'doc-old' }, { tab: { id: 12 }, frameId: 1 }, (r) => responds.push(r));
    test('I00-回执容量有界(最旧轮被淘汰)', (responds[0] as { reason?: string } | undefined)?.reason === 'unknown-run', responds[0]);
  }
  // I00:一个区域未终态时,deadline 只报超时+missing,不得报成功。
  {
    const h = loadBackground();
    h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: 13 } }, () => undefined);
    const runId = (h.messages[0][1] as { runId: string }).runId;
    h.messages.length = 0;
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-0' }, { tab: { id: 13 }, frameId: 0 }, () => undefined);
    h.handler?.({ type: 'FILL_TERMINAL', runId, docId: 'doc-0', frameSeq: 1, stats: stats(1), items: [] }, { tab: { id: 13 }, frameId: 0 }, () => undefined);
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-1' }, { tab: { id: 13 }, frameId: 1 }, () => undefined); // 帧1迟迟不终态
    h.timers.find((t) => t.ms === 700)?.fn();
    const deadline = [...h.timers].reverse().find((t) => t.ms === 25000);
    deadline?.fn();
    const done = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_DONE').map((m) => m[1] as { timedOut?: boolean; missing?: string[]; stats?: { filled?: number } }).pop();
    test('I00-未终态区域只报超时与缺失', done?.timedOut === true && done?.missing?.length === 1 && done?.stats?.filled === 1, done);
  }
  // I00:等待人工的帧以明确终态类别计入(不得按普通完成混同)。
  {
    const h = loadBackground();
    h.handler?.({ type: 'PANEL_FILL' }, { tab: { id: 14 } }, () => undefined);
    const runId = (h.messages[0][1] as { runId: string }).runId;
    h.messages.length = 0;
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-0' }, { tab: { id: 14 }, frameId: 0 }, () => undefined);
    h.handler?.({ type: 'FILL_REGISTER', runId, docId: 'doc-1' }, { tab: { id: 14 }, frameId: 1 }, () => undefined);
    h.handler?.({ type: 'FILL_TERMINAL', runId, docId: 'doc-0', frameSeq: 1, stats: stats(1), items: [], terminalKind: 'done' }, { tab: { id: 14 }, frameId: 0 }, () => undefined);
    h.handler?.({ type: 'FILL_TERMINAL', runId, docId: 'doc-1', frameSeq: 1, stats: { ...EMPTY_STATS, picker: 1 }, items: [], terminalKind: 'waiting-manual' }, { tab: { id: 14 }, frameId: 1 }, () => undefined);
    h.timers.find((t) => t.ms === 700)?.fn();
    const done = h.messages.filter((m) => (m[1] as { type: string }).type === 'FILL_DONE').map((m) => m[1] as { terminalKinds?: Record<string, number>; timedOut?: boolean }).pop();
    test('I00-等待人工以独立终态类别计入', done?.terminalKinds?.['waiting-manual'] === 1 && done?.terminalKinds?.['done'] === 1 && done?.timedOut === false, done);
  }
}

export function getV7LifecycleFailures(): string[] {
  return failures;
}

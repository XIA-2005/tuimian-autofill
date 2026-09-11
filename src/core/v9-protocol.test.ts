// v9 协议时序与载荷完整性——作者侧独立断言(不是判定方 src/core/v9-review.test.ts 的复制)。
// 规格来源(冻结):src/core/v9-review.test.ts + docs/analysis/codex-v8-review-2026-09-10/final-unit.log,
// 四条缺陷:①暂停/恢复无帧序号检查 ②FILL_PAUSE 缺失 frameSeq 被默认成 1 ③FILL_STOP 载荷缺 docId
// ④新注册不重算等待策略。作者侧补的边界:顺序水位探测、非法序号无副作用、未注册/已终态不得被暂停、
// 策略切换双向性、FILL_STOP 作用域精确匹配、续轮合并统计自洽与 el 归属、遥测恢复时间边界。
// 证明层级:unit=RunAggregator/merge/telemetry 纯逻辑;bg=真实 background bundle 的 VM 消息入口
// (非浏览器、非真实扩展运行时、非真实站点)。liveVerified=false。
// 每条断言都对应一处可删除的生产守卫,变异自检记录见 docs/dev-notes/implementation-progress-v9.md。
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { RunAggregator } from '../background/aggregation';
import type { FrameFillReport } from '../background/aggregation';
import { mergeResumeResults } from './fill-merge';
import { restoreFillTelemetryState } from './fill-telemetry';
import type { FillItem, FillResult, FillStats } from './filler';

const failures: string[] = [];

/** 功能:记录一条断言失败;用例名必须能独立定位到守卫。 */
function test(name: string, cond: boolean, detail?: unknown): void {
  if (cond) return;
  failures.push(detail === undefined ? name : `${name} :: ${JSON.stringify(detail)}`);
}

function emptyS(filled = 0): FillStats {
  return { total: filled, filled, failed: 0, skipped: 0, noMatch: 0, picker: 0, profileEmpty: 0, pickerResumeCount: 0 };
}

/** 功能:构造一份带帧序号的参与者报告(unit 层)。 */
function report(frameSeq: number, docId = 'doc', frameId = 0, runId = 'R', filled = 1): FrameFillReport {
  return { runId, frameId, docId, frameSeq, stats: emptyS(filled), items: [] };
}

interface VmTimer {
  fn: () => void;
  ms: number;
  active: boolean;
}
interface VmMessage {
  tabId: number;
  message: Record<string, any>;
  options?: Record<string, any>;
}
interface BgHarness {
  timers: VmTimer[];
  messages: VmMessage[];
  /** 功能:投递一条消息到真实 background 入口并取回同步回执。 */
  send: (message: Record<string, unknown>, tabId: number, frameId?: number) => any;
  /** 功能:是否存在指定时长的"有效"(未被 clearTimeout)定时器。 */
  active: (ms: number) => boolean;
  /** 功能:触发最近一个指定时长的有效定时器(不存在则抛错,避免假通过)。 */
  fire: (ms: number) => void;
  /** 功能:发起一轮(PANEL_FILL)并返回后台分配的 runId。 */
  start: (tabId: number) => string;
}

/** 功能:加载真实 background bundle 到隔离 VM,记录定时器与出站消息;每个 harness 是独立的一轮状态。 */
function loadBackground(): BgHarness {
  const code = buildSync({ entryPoints: ['src/background/index.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const state: {
    timers: VmTimer[];
    messages: VmMessage[];
    handler?: (msg: any, sender: any, respond: (r: unknown) => void) => unknown;
  } = { timers: [], messages: [] };
  vm.runInNewContext(code, {
    console,
    crypto: require('node:crypto').webcrypto,
    setTimeout: (fn: () => void, ms: number) => {
      state.timers.push({ fn, ms, active: true });
      return state.timers.length;
    },
    clearTimeout: (id: number) => {
      const timer = state.timers[id - 1];
      if (timer) timer.active = false;
    },
    chrome: {
      runtime: { onInstalled: { addListener: () => undefined }, onMessage: { addListener: (fn: typeof state.handler) => { state.handler = fn; } } },
      tabs: {
        sendMessage: (tabId: number, message: Record<string, any>, options?: Record<string, any>) => {
          state.messages.push({ tabId, message, options });
          return Promise.resolve();
        },
      },
    },
  });
  const send = (message: Record<string, unknown>, tabId: number, frameId = 0) => {
    let response: any;
    state.handler?.(message, { tab: { id: tabId }, frameId }, (r: unknown) => { response = r; });
    return response;
  };
  return {
    timers: state.timers,
    messages: state.messages,
    send,
    active: (ms: number) => state.timers.some((timer) => timer.active && timer.ms === ms),
    fire: (ms: number) => {
      const timer = [...state.timers].reverse().find((t) => t.active && t.ms === ms);
      if (!timer) throw new Error(`无有效的 ${ms}ms 定时器,用例前提不成立`);
      timer.active = false;
      timer.fn();
    },
    start: (tabId: number) => {
      send({ type: 'PANEL_FILL' }, tabId);
      return state.messages[state.messages.length - 1].message.runId as string;
    },
  };
}

/** 功能:统计合并结果里六类可计数状态的出现次数,用于断言 stats 与 items 自洽。 */
function countedStatuses(items: FillItem[]): number {
  return items.filter((item) => ['filled', 'failed', 'skipped', 'profileEmpty', 'noMatch', 'picker'].includes(item.status)).length;
}

/** 功能:v9 协议时序与载荷完整性用例(作者侧)。 */
export function runV9ProtocolTests(): void {
  // ===== A 组:unit —— 暂停/恢复必须是有序消息流,且不得有副作用 =====
  {
    const agg = new RunAggregator('R');
    agg.register(0, 'doc');
    test('A0 注册者按更高序号暂停生效', agg.setPaused(report(5), true) === true);
    test('A1 迟到的恢复(seq 3)不得解除更新的暂停', agg.setPaused(report(3), false) === false);
    test('A1b 被拒的恢复不得改变暂停状态', agg.pausedOnlyPending() === true);
    test('A2 按更高序号恢复生效', agg.setPaused(report(7), false) === true);
    test('A3 迟到的暂停(seq 6)不得覆盖更新的恢复', agg.setPaused(report(6), true) === false);
    test('A3b 被拒的暂停不得改变恢复状态', agg.pausedOnlyPending() === false);
    // 被拒消息若偷偷改写了顺序水位,更低序号的结果就会被错误接受——用 accept 当探针。
    test('A4 更旧序号(seq 1)的暂停被拒', agg.setPaused(report(1), true) === false);
    test('A5 被拒消息不得降低顺序水位(seq 2 结果仍须拒绝)', agg.accept(report(2)) === false);
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3' as unknown as number, undefined as unknown as number]) {
      test(`A6 非法帧序号暂停被拒(${String(bad)})`, agg.setPaused(report(bad as number), true) === false);
    }
    test('A6b 非法帧序号不得改变暂停状态', agg.pausedOnlyPending() === false);

    const unknown = new RunAggregator('R');
    unknown.register(0, 'doc');
    test('A7 未注册参与者的暂停被拒', unknown.setPaused(report(1, 'ghost'), true) === false);
    test('A7b 未注册参与者的暂停不得凭空注册', unknown.participantsCount() === 1);
    test('A7c 未注册参与者的暂停不得污染等待判定', unknown.pausedOnlyPending() === false);

    const done = new RunAggregator('R');
    done.register(0, 'doc');
    test('A8 终态建立成功', done.terminalize(report(1)) === true);
    test('A9 已终态参与者不得被暂停重新打开', done.setPaused(report(2), true) === false);
    test('A9b 已终态参与者的重复终态不得改变结论', done.terminalize(report(3)) === false);
    test('A9c 已终态参与者不进入等待判定', done.pausedOnlyPending() === false);

    const mixed = new RunAggregator('R');
    mixed.register(0, 'a');
    mixed.register(1, 'b');
    test('A10 单区域暂停生效', mixed.setPaused(report(1, 'a', 0), true) === true);
    test('A11 存在未暂停参与者时不得判定为"全部等人工"', mixed.pausedOnlyPending() === false);
    test('A12 另一区域暂停后进入"全部等人工"', mixed.setPaused(report(1, 'b', 1), true) === true && mixed.pausedOnlyPending() === true);
    test('A13 终态区域解除后仍有暂停区域时保持等待判定', mixed.terminalize(report(2, 'b', 1)) === true && mixed.pausedOnlyPending() === true);
  }

  // ===== B 组:bg —— FILL_PAUSE/FILL_RESUME 载荷门槛与副作用 =====
  {
    const b = loadBackground();
    const runId = b.start(7);
    b.send({ type: 'FILL_REGISTER', runId, docId: 'top' }, 7, 0);
    test('B0 本轮初始使用硬 deadline', b.active(25000) === true);
    const missingSeq = b.send({ type: 'FILL_PAUSE', runId, docId: 'top', stats: emptyS(1), items: [] }, 7, 0);
    test('B1 缺帧序号的暂停不得被接受', missingSeq?.ok !== true, missingSeq);
    test('B1b 缺帧序号的暂停不得把硬 deadline 换成人工预算', b.active(300000) === false);
    test('B1c 缺帧序号的暂停不得撤掉硬 deadline', b.active(25000) === true);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      const resp = b.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: bad, stats: emptyS(1), items: [] }, 7, 0);
      test(`B2 非法帧序号(${String(bad)})的暂停不得被接受`, resp?.ok !== true, resp);
    }
    test('B2b 非法帧序号不得切换等待策略', b.active(300000) === false);
    const noDoc = b.send({ type: 'FILL_PAUSE', runId, frameSeq: 9, stats: emptyS(1), items: [] }, 7, 0);
    test('B3 缺 docId 的暂停不得被接受', noDoc?.ok !== true, noDoc);
    const noRun = b.send({ type: 'FILL_PAUSE', docId: 'top', frameSeq: 9, stats: emptyS(1), items: [] }, 7, 0);
    test('B3b 缺 runId 的暂停不得被接受', noRun?.ok !== true, noRun);
    const stale = b.send({ type: 'FILL_PAUSE', runId: 'stale-run', docId: 'top', frameSeq: 9, stats: emptyS(1), items: [] }, 7, 0);
    test('B4 旧轮 runId 的暂停不得被接受', stale?.ok !== true, stale);
    test('B4b 旧轮 runId 不得切换本轮等待策略', b.active(300000) === false && b.active(25000) === true);
    const paused = b.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: 1, stats: emptyS(1), items: [] }, 7, 0);
    test('B5 合法暂停被接受', paused?.ok === true, paused);
    test('B6 合法暂停切换到人工预算并撤掉硬 deadline', b.active(300000) === true && b.active(25000) === false);
    const resumed = b.send({ type: 'FILL_RESUME', runId, docId: 'top', frameSeq: 2, stats: emptyS(1), items: [] }, 7, 0);
    test('B7 合法恢复被接受', resumed?.ok === true, resumed);
    test('B8 恢复后回到硬 deadline 并撤掉人工预算', b.active(25000) === true && b.active(300000) === false);
    const staleResume = b.send({ type: 'FILL_RESUME', runId: 'stale-run', docId: 'top', frameSeq: 99, stats: emptyS(1), items: [] }, 7, 0);
    test('B9 旧轮 runId 的恢复不得被接受', staleResume?.ok !== true, staleResume);
    const olderResume = b.send({ type: 'FILL_RESUME', runId, docId: 'top', frameSeq: 2, stats: emptyS(1), items: [] }, 7, 0);
    test('B10 重复序号的恢复不得被接受', olderResume?.ok !== true, olderResume);
  }

  // ===== C 组:bg —— FILL_STOP 载荷与作用域 =====
  {
    const c = loadBackground();
    const runId = c.start(7);
    c.send({ type: 'FILL_REGISTER', runId, docId: 'docA' }, 7, 0);
    c.send({ type: 'FILL_REGISTER', runId, docId: 'docB' }, 7, 1);
    c.send({ type: 'FILL_TERMINAL', runId, docId: 'docB', frameSeq: 1, stats: emptyS(3), items: [] }, 7, 1);
    c.messages.length = 0;
    c.fire(25000);
    const stops = c.messages.filter((m) => m.message.type === 'FILL_STOP');
    test('C1 每个停止通知都带 docId 字符串', stops.length > 0 && stops.every((m) => typeof m.message.docId === 'string' && m.message.docId.length > 0));
    test('C2 只向未终态参与者发停止通知', stops.length === 1 && stops[0].message.docId === 'docA', stops.map((m) => m.message.docId));
    test('C3 停止通知的 runId 必须是本轮', stops[0]?.message.runId === runId);
    test('C4 停止通知必须限定到该参与者所在 frame', stops[0]?.options?.frameId === 0, stops[0]?.options);
    test('C5 deadline 停止通知的 reason 必须是 deadline', stops[0]?.message.reason === 'deadline');
    const done = c.messages.find((m) => m.message.type === 'FILL_DONE')?.message;
    test('C6 deadline 收口保留已终态区域统计', done?.stats?.filled === 3 && done?.missing?.length === 1, done?.stats);
    test('C7 deadline 收口不得把未终态区域算成成功', done?.finishReason === 'deadline' && done?.timedOut === true);

    const all = loadBackground();
    const allRunId = all.start(7);
    all.send({ type: 'FILL_REGISTER', runId: allRunId, docId: 'docA' }, 7, 0);
    all.send({ type: 'FILL_TERMINAL', runId: allRunId, docId: 'docA', frameSeq: 1, stats: emptyS(2), items: [] }, 7, 0);
    all.messages.length = 0;
    all.fire(700);
    test('C8 全部终态收口不得发送停止通知', all.messages.every((m) => m.message.type !== 'FILL_STOP'));
    test('C9 全部终态收口按 all-terminal 完成', all.messages.find((m) => m.message.type === 'FILL_DONE')?.message.finishReason === 'all-terminal');

    const manual = loadBackground();
    const manualRunId = manual.start(7);
    manual.send({ type: 'FILL_REGISTER', runId: manualRunId, docId: 'docA' }, 7, 0);
    manual.send({ type: 'FILL_PAUSE', runId: manualRunId, docId: 'docA', frameSeq: 1, stats: emptyS(2), items: [] }, 7, 0);
    manual.messages.length = 0;
    manual.fire(300000);
    const manualStop = manual.messages.find((m) => m.message.type === 'FILL_STOP')?.message;
    const manualDone = manual.messages.find((m) => m.message.type === 'FILL_DONE')?.message;
    test('C10 人工预算耗尽的停止通知 reason 必须是 manual-timeout', manualStop?.reason === 'manual-timeout', manualStop?.reason);
    test('C11 人工预算耗尽的停止通知必须带本轮 docId/runId', manualStop?.docId === 'docA' && manualStop?.runId === manualRunId);
    test('C12 人工预算耗尽按 waiting-manual 如实归类', manualDone?.finishReason === 'manual-timeout' && manualDone?.terminalKinds?.['waiting-manual'] === 1, manualDone?.terminalKinds);
    test('C13 人工暂停区域的既有快照不得在收口时丢失', manualDone?.stats?.total === 2 && manualDone?.stats?.filled === 2, manualDone?.stats);
    test('C14 同一暂停区域不得被重复计入 missing', manualDone?.missing?.length === 1, manualDone?.missing);
  }

  // ===== D 组:bg —— 等待策略必须双向重算 =====
  {
    const d = loadBackground();
    const runId = d.start(7);
    d.send({ type: 'FILL_REGISTER', runId, docId: 'top' }, 7, 0);
    d.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: 1, stats: emptyS(1), items: [] }, 7, 0);
    test('D1 仅剩人工等待时使用暂停预算', d.active(300000) === true && d.active(25000) === false);
    d.send({ type: 'FILL_REGISTER', runId, docId: 'child' }, 7, 1);
    test('D2 新自动区域注册后必须重算为硬 deadline', d.active(25000) === true && d.active(300000) === false);
    d.send({ type: 'FILL_PAUSE', runId, docId: 'child', frameSeq: 1, stats: emptyS(1), items: [] }, 7, 1);
    test('D3 新区域也进入人工等待后必须重算回暂停预算(双向)', d.active(300000) === true && d.active(25000) === false);
    d.send({ type: 'FILL_RESUME', runId, docId: 'top', frameSeq: 2, stats: emptyS(1), items: [] }, 7, 0);
    test('D4 任一区域恢复后必须重算回硬 deadline', d.active(25000) === true && d.active(300000) === false);
    d.send({ type: 'FILL_TERMINAL', runId, docId: 'child', frameSeq: 2, stats: emptyS(1), items: [] }, 7, 1);
    d.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: 3, stats: emptyS(1), items: [] }, 7, 0);
    test('D5 终态后仅剩人工等待必须重算回暂停预算', d.active(300000) === true && d.active(25000) === false);
    d.send({ type: 'FILL_TERMINAL', runId, docId: 'top', frameSeq: 4, stats: emptyS(1), items: [] }, 7, 0);
    test('D6 全部终态后不得继续保留人工预算', d.active(300000) === false);
  }

  // ===== E 组:unit —— 续轮合并以最新一轮为准,且统计自洽 =====
  {
    const el = {} as Element;
    const previous = (status: FillItem['status']): FillResult => ({ items: [{ label: '姓名', field: 'basic.name', status, el }], stats: emptyS(status === 'filled' ? 1 : 0) });
    for (const status of ['failed', 'conflict', 'picker', 'skipped', 'noMatch', 'profileEmpty'] as FillItem['status'][]) {
      const round: FillResult = { items: [{ label: '姓名', field: 'basic.name', status, el }], stats: emptyS() };
      const merged = mergeResumeResults(previous('filled'), round);
      test(`E1 旧成功不得掩盖最新状态(${status})`, merged.items.length === 1 && merged.items[0].status === status, merged.items);
      test(`E1b 旧成功不得留在统计里(${status})`, merged.stats.filled === 0, merged.stats);
    }
    {
      const round: FillResult = { items: [{ label: '姓名', field: 'basic.name', status: 'filled', el }], stats: emptyS(1) };
      const merged = mergeResumeResults(previous('failed'), round);
      test('E2 旧失败不得拖住最新成功', merged.items[0].status === 'filled' && merged.stats.filled === 1, merged.stats);
      test('E2b 最新轮必须保留元素引用(否则高亮失效)', merged.items[0].el === el);
    }
    {
      const olderEl = {} as Element;
      const prev: FillResult = { items: [{ label: '邮箱', field: 'basic.email', status: 'filled', el: olderEl }], stats: emptyS(1) };
      const round: FillResult = { items: [{ label: '姓名', field: 'basic.name', status: 'filled', el }], stats: emptyS(1) };
      const merged = mergeResumeResults(prev, round);
      test('E3 未重新确认的旧目标必须落回失败而非沿用旧成功', merged.items.length === 2 && merged.items[1].status === 'failed', merged.items);
      test('E3b 未重新确认的旧目标不得保留旧元素引用', merged.items[1].el === undefined);
      test('E3c 未重新确认的旧目标不得继续计入已填', merged.stats.filled === 1, merged.stats);
    }
    {
      const prev: FillResult = { items: [{ label: '姓名', field: 'basic.name', status: 'filled', el }], stats: emptyS(1) };
      const round: FillResult = { items: [{ label: '姓名', field: 'basic.name', status: 'filled', el }], stats: emptyS(1) };
      const merged = mergeResumeResults(prev, round);
      test('E4 同一逻辑目标不得产生重复条目', merged.items.length === 1, merged.items);
      test('E5 合并后统计必须与条目自洽', merged.stats.total === merged.items.length && merged.stats.filled === countedStatuses(merged.items), merged.stats);
    }
    {
      const prev: FillResult = { items: [{ label: '姓名', field: 'basic.name', status: 'filled', el }], stats: emptyS(1) };
      const round: FillResult = { items: [{ label: '姓名', field: 'basic.name', status: 'alreadyCorrect', el }, { label: '邮箱', field: 'basic.email', status: 'filled', el }], stats: emptyS(1) };
      const merged = mergeResumeResults(prev, round);
      test('E6 最新轮的观测项不得被丢弃', merged.items.some((item) => item.status === 'alreadyCorrect'));
      test('E6b alreadyCorrect 不得被算成本轮已填', merged.stats.filled === 1, merged.stats);
      test('E6c 合并后 total 必须等于条目数', merged.stats.total === merged.items.length, merged.stats);
    }
  }

  // ===== F 组:unit —— 旧遥测快照的原文与时间边界 =====
  {
    const snapshot = (extra: Record<string, unknown>): string => JSON.stringify({ runId: 'run-abc', startedAt: 1, updatedAt: 2, events: [], counts: { total: 0 }, ...extra });
    test('F0 未过期快照可恢复(用例前提)', restoreFillTelemetryState(snapshot({}), 3) !== null);
    test('F0b 非法 JSON 拒绝', restoreFillTelemetryState('{', 3) === null);
    test('F0c 缺 runId 拒绝', restoreFillTelemetryState(JSON.stringify({ updatedAt: 1, events: [] }), 3) === null);
    test('F1 旧 runId 不得原文透传', !JSON.stringify(restoreFillTelemetryState(snapshot({}), 3)).includes('run-abc'));
    for (const marker of ['Alice', 'PRIVATE_RUN_ID', 'DEEPSEEK_CANARY_9f3a']) {
      const restored = restoreFillTelemetryState(snapshot({ runId: marker }), 3);
      test(`F1b 旧 runId 标记不得原文透传(${marker})`, restored !== null && !JSON.stringify(restored).includes(marker));
    }
    const dirty = JSON.stringify({
      runId: 'run-abc',
      startedAt: 1,
      updatedAt: 2,
      counts: { total: 1, filled: 1 },
      events: [{ action: '填写状态更新', field: 'basic.name', targetLabel: '张三', reason: 'token-9f8e7d', url: 'https://example.edu.cn/x?token=1', unknownKey: { raw: 'page-html-原文' }, stage: 'idle' }],
    });
    const cleaned = restoreFillTelemetryState(dirty, 3);
    const cleanedText = JSON.stringify(cleaned);
    test('F2 脏快照可恢复(用例前提)', cleaned !== null);
    for (const marker of ['张三', 'token-9f8e7d', 'https://example.edu.cn', 'page-html-原文', 'unknownKey']) {
      test(`F2b 页面原文/未知键不得透传(${marker})`, !cleanedText.includes(marker));
    }
    test('F3 未来时间戳拒绝', restoreFillTelemetryState(snapshot({ updatedAt: 4 }), 3) === null);
    test('F3b 恰好 30 分钟边界可恢复', restoreFillTelemetryState(snapshot({ startedAt: 0, updatedAt: 1 }), 1 + 30 * 60_000) !== null);
    test('F3c 超过 30 分钟拒绝', restoreFillTelemetryState(snapshot({ startedAt: 0, updatedAt: 1 }), 1 + 30 * 60_000 + 1) === null);
    test('F3d 负数时间戳拒绝', restoreFillTelemetryState(snapshot({ updatedAt: -1, startedAt: -2 }), 3) === null);
    test('F3e 非数值 updatedAt 不得被当成刚更新', restoreFillTelemetryState(snapshot({ updatedAt: Number.NaN, startedAt: 0 }), 1 + 30 * 60_000 + 1) === null);
    test('F3f 字符串 updatedAt 不得被当成刚更新', restoreFillTelemetryState(snapshot({ updatedAt: '2', startedAt: 0 } as Record<string, unknown>), 1 + 30 * 60_000 + 1) === null);
    test('F4 startedAt 晚于 updatedAt 拒绝', restoreFillTelemetryState(snapshot({ startedAt: 40, updatedAt: 5 }), 5) === null);
  }
}

/** 功能:返回作者侧 v9 协议用例的失败清单(空数组=全通过)。 */
export function getV9ProtocolFailures(): string[] {
  return failures;
}

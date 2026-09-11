import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { RunAggregator } from '../background/aggregation';
import { mergeResumeResults } from './fill-merge';
import { restoreFillTelemetryState } from './fill-telemetry';
import type { FillItem, FillResult, FillStats } from './filler';

const stats = (filled = 0): FillStats => ({ total: filled, filled, failed: 0, skipped: 0, noMatch: 0, picker: 0, profileEmpty: 0, pickerResumeCount: 0 });

/** 功能：真实background入口的可控时钟，正确记录clearTimeout，测试暂停策略切换。 */
function backgroundHarness() {
  const code = buildSync({ entryPoints: ['src/background/index.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const timers: Array<{ fn: () => void; ms: number; active: boolean }> = [];
  const messages: Array<[number, Record<string, any>, unknown?]> = [];
  const rejectedBroadcasts: Array<(reason: unknown) => void> = [];
  let handler: (msg: any, sender: any, respond: (value: unknown) => void) => void = () => undefined;
  vm.runInNewContext(code, { console, crypto: require('node:crypto').webcrypto,
    setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms, active: true }); return timers.length; },
    clearTimeout: (id: number) => { if (timers[id - 1]) timers[id - 1].active = false; },
    chrome: { runtime: { onInstalled: { addListener: () => undefined }, onMessage: { addListener: (fn: typeof handler) => { handler = fn; } } }, tabs: {
      sendMessage: (tab: number, message: Record<string, any>, options?: unknown) => {
        messages.push([tab, message, options]);
        if (message.type === 'FILL') return new Promise((_resolve, reject) => rejectedBroadcasts.push(reject));
        return Promise.resolve();
      },
    } },
  });
  const send = (message: Record<string, unknown>, frameId = 0) => { let response: any; handler(message, { tab: { id: 7 }, frameId }, (r) => { response = r; }); return response; };
  return { timers, messages, rejectedBroadcasts, send,
    start: () => { send({ type: 'PANEL_FILL' }); return messages[messages.length - 1][1].runId as string; },
    fire: (ms: number) => { const timer = [...timers].reverse().find((t) => t.active && t.ms === ms); assert.ok(timer, `应存在${ms}ms有效定时器`); timer.active = false; timer.fn(); },
  };
}

/** 功能：复审暂停顺序、预算切换、原文迁移以及续轮结果覆盖的真实反例。 */
export async function runV9ReviewTests(): Promise<void> {
  const g = new RunAggregator('R'); g.register(0, 'doc');
  const report = (seq: number) => ({ runId: 'R', frameId: 0, docId: 'doc', frameSeq: seq, stats: stats(1), items: [] });
  assert.equal(g.setPaused(report(2), true), true);
  assert.equal(g.setPaused(report(1), false), false, '旧恢复不得解除新暂停');
  assert.equal(g.pausedOnlyPending(), true);
  assert.equal(g.setPaused(report(3), false), true);
  assert.equal(g.setPaused(report(2), true), false, '旧暂停不得覆盖新恢复');
  assert.equal(g.setPaused(report(Infinity), true), false);

  const h = backgroundHarness(); const runId = h.start();
  h.send({ type: 'FILL_REGISTER', runId, docId: 'top' });
  h.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: 1, stats: stats(1), items: [] });
  assert.ok(h.timers.some((t) => t.active && t.ms === 300000));
  h.send({ type: 'FILL_REGISTER', runId, docId: 'child' }, 1);
  assert.equal(h.timers.some((t) => t.active && t.ms === 300000), false, '新自动frame不能沿用人工暂停预算');
  h.fire(25000);
  assert.ok(h.messages.filter((m) => m[1].type === 'FILL_STOP').every((m) => typeof m[1].docId === 'string'));

  const p = backgroundHarness(); const pausedId = p.start();
  p.send({ type: 'FILL_REGISTER', runId: pausedId, docId: 'paused' });
  const invalid = p.send({ type: 'FILL_PAUSE', runId: pausedId, docId: 'paused', stats: stats(1), items: [] });
  assert.equal(invalid.ok, false, '缺序号暂停消息不得用1补齐');
  p.send({ type: 'FILL_PAUSE', runId: pausedId, docId: 'paused', frameSeq: 1, stats: stats(1), items: [] });
  p.fire(300000);
  const done = p.messages.find((m) => m[1].type === 'FILL_DONE')![1];
  assert.equal(done.missing.length, 1, '一个暂停区域不得重复报成两个');
  assert.equal(done.terminalKinds['waiting-manual'], 1);
  assert.equal(done.finishReason, 'manual-timeout');
  assert.equal(done.stats.total, 1, '暂停超时仍保留此前已回报的字段快照');
  assert.equal(done.stats.filled, 1);

  const race = backgroundHarness(); race.start(); const current = race.start();
  race.rejectedBroadcasts[0](new Error('old broadcast failure'));
  await new Promise<void>((resolve) => setTimeout(resolve, 0)); // 跨VM realm的await须等微任务链全部落定。
  race.send({ type: 'FILL_REGISTER', runId: current, docId: 'new' });
  race.send({ type: 'FILL_TERMINAL', runId: current, docId: 'new', frameSeq: 1, stats: stats(1), items: [] });
  race.fire(700);
  assert.ok(race.messages.some((m) => m[1].type === 'FILL_DONE' && m[1].runId === current), '旧广播异常不得取消新轮');

  const el = {} as Element;
  const previous: FillResult = { items: [{ label: '姓名', field: 'basic.name', status: 'filled', el }], stats: stats(1) };
  for (const status of ['failed', 'conflict', 'picker'] as FillItem['status'][]) {
    const round: FillResult = { items: [{ label: '姓名', field: 'basic.name', status, el }], stats: stats() };
    const merged = mergeResumeResults(previous, round);
    assert.equal(merged.items[0].status, status, '旧成功不能掩盖最新失败/冲突/等待');
    assert.equal(merged.stats.filled, 0);
  }
  const duplicateA = {} as Element;
  const duplicateB = {} as Element;
  const duplicatedPrevious: FillResult = {
    items: [
      { label: '姓名 A', field: 'basic.name', status: 'filled', el: duplicateA },
      { label: '姓名 B', field: 'basic.name', status: 'filled', el: duplicateB },
    ],
    stats: stats(2),
  };
  const duplicateRound: FillResult = {
    items: [{ label: '姓名 B', field: 'basic.name', status: 'filled', el: duplicateB }],
    stats: stats(1),
  };
  const duplicateMerged = mergeResumeResults(duplicatedPrevious, duplicateRound);
  assert.equal(duplicateMerged.items.length, 2, '同字段的另一个控件不能冒充旧目标已重新确认');
  assert.equal(duplicateMerged.items.find((item) => item.label === '姓名 A')?.status, 'failed');
  assert.equal(duplicateMerged.stats.filled, 1);
  assert.equal(duplicateMerged.stats.failed, 1);
  for (const marker of ['Alice', 'PRIVATE_RUN_ID']) {
    const restored = restoreFillTelemetryState(JSON.stringify({ runId: marker, startedAt: 1, updatedAt: 2, events: [], counts: { total: 0 } }), 3);
    assert.ok(restored);
    assert.equal(JSON.stringify(restored).includes(marker), false, '旧runId也不得原文透传');
  }
  assert.equal(restoreFillTelemetryState(JSON.stringify({ runId: 'r', updatedAt: 100, events: [] }), 3), null, '未来时间不得绕过过期校验');
}

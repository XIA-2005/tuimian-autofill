// K04 独立复核探针(ds-v9-verify):不复用 Codex 的测试文件,按 PLAN v9 K00–K02 的需求原文重新推导断言。
// 层级:bg = 真实 background bundle 消息入口(VM);unit = 真实生产模块。
// 说明:本文件只读源码、不改生产代码;退出 0 表示"采集完成",其内每条断言的结果才是结论。
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '../../..');
process.chdir(root);

const results = [];
const fails = [];
function check(name, ok, detail) {
  const line = { name, ok: !!ok };
  if (detail !== undefined) line.detail = detail;
  results.push(line);
  if (!ok) fails.push(`${name}${detail === undefined ? '' : ' :: ' + JSON.stringify(detail)}`);
}

/** 功能:真实 background bundle VM;正确跟踪 clearTimeout,以便断言"有效定时器"。 */
function loadBackground() {
  const source = buildSync({ entryPoints: ['src/background/index.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const timers = [];
  const messages = [];
  const rejectedBroadcasts = [];
  let handler = () => undefined;
  vm.runInNewContext(source, {
    console,
    crypto: require('node:crypto').webcrypto,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, active: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].active = false; },
    chrome: {
      runtime: { onInstalled: { addListener: () => undefined }, onMessage: { addListener: (fn) => { handler = fn; } } },
      tabs: {
        sendMessage: (tab, message, options) => {
          messages.push([tab, message, options]);
          if (message && message.type === 'FILL') return new Promise((_res, rej) => rejectedBroadcasts.push(rej));
          return Promise.resolve();
        },
      },
    },
  });
  return {
    timers, messages, rejectedBroadcasts,
    send: (message, frameId = 0) => { let resp; handler(message, { tab: { id: 7 }, frameId }, (r) => { resp = r; }); return resp; },
    start: () => { handler({ type: 'PANEL_FILL' }, { tab: { id: 7 } }, () => undefined); return messages[messages.length - 1][1].runId; },
    activeTimers: (ms) => timers.filter((t) => t.active && t.ms === ms).length,
    stopMessages: () => messages.filter((m) => m[1] && m[1].type === 'FILL_STOP'),
    doneMessages: () => messages.filter((m) => m[1] && m[1].type === 'FILL_DONE'),
  };
}

const EMPTY = { total: 0, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 };
const statsOf = (o) => Object.assign({}, EMPTY, o || {});

async function main() {
  // ---------- K00:暂停/恢复必须走与 RESULT/TERMINAL 同一严格递增序号 ----------
  {
    const h = loadBackground();
    const runId = h.start();
    h.send({ type: 'FILL_REGISTER', runId, docId: 'top' });
    const missing = h.send({ type: 'FILL_PAUSE', runId, docId: 'top', stats: statsOf({ total: 1, picker: 1 }), items: [] });
    check('K00-暂停缺seq被拒(不补默认1)', missing && missing.ok === false && missing.reason === 'invalid-sequence', missing);
    const inf = h.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: Infinity, stats: statsOf({ total: 1, picker: 1 }), items: [] });
    check('K00-暂停seq为Infinity被拒', inf && inf.ok === false, inf);
    const ok1 = h.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: 2, stats: statsOf({ total: 1, picker: 1 }), items: [] });
    check('K00-合法暂停被接受', ok1 && ok1.ok === true, ok1);
    const stale = h.send({ type: 'FILL_RESUME', runId, docId: 'top', frameSeq: 1, stats: statsOf({ total: 1, filled: 1 }), items: [] });
    check('K00-旧恢复不能解除新暂停', stale && stale.ok === false, stale);
    const resume3 = h.send({ type: 'FILL_RESUME', runId, docId: 'top', frameSeq: 3, stats: statsOf({ total: 1, filled: 1 }), items: [] });
    check('K00-新恢复被接受', resume3 && resume3.ok === true, resume3);
    const stalePause = h.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: 2, stats: statsOf({ total: 1, picker: 1 }), items: [] });
    check('K00-旧暂停不能覆盖新恢复', stalePause && stalePause.ok === false, stalePause);
    // 同类守卫必须在姊妹消息上同样存在(RESUME 不能比 PAUSE 松)
    const resumeNoSeq = h.send({ type: 'FILL_RESUME', runId, docId: 'top', stats: statsOf({ total: 1, filled: 1 }), items: [] });
    check('K00-恢复缺seq同样被拒', resumeNoSeq && resumeNoSeq.ok === false && resumeNoSeq.reason === 'invalid-sequence', resumeNoSeq);
    const resumeInf = h.send({ type: 'FILL_RESUME', runId, docId: 'top', frameSeq: Infinity, stats: statsOf({ total: 1, filled: 1 }), items: [] });
    check('K00-恢复seq为Infinity被拒', resumeInf && resumeInf.ok === false, resumeInf);
  }

  // ---------- K00:新自动区域加入后必须重算等待策略(不能沿用人工暂停预算) ----------
  {
    const h = loadBackground();
    const runId = h.start();
    h.send({ type: 'FILL_REGISTER', runId, docId: 'top' });
    h.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: 1, stats: statsOf({ total: 1, picker: 1 }), items: [] });
    check('K00-仅人工暂停时启用暂停预算', h.activeTimers(300000) === 1 && h.activeTimers(25000) === 0, { pause: h.activeTimers(300000), deadline: h.activeTimers(25000) });
    h.send({ type: 'FILL_REGISTER', runId, docId: 'child' }, 1);
    check('K00-新自动区域加入后恢复硬deadline', h.activeTimers(25000) === 1 && h.activeTimers(300000) === 0, { pause: h.activeTimers(300000), deadline: h.activeTimers(25000) });
  }

  // ---------- K00:暂停预算到期 → 去重计数 + STOP 带文档身份 + 保留暂停前快照 ----------
  {
    const h = loadBackground();
    const runId = h.start();
    h.send({ type: 'FILL_REGISTER', runId, docId: 'top' });
    h.send({ type: 'FILL_PAUSE', runId, docId: 'top', frameSeq: 1, stats: statsOf({ total: 3, filled: 2, picker: 1 }), items: [] });
    const budget = h.timers.filter((t) => t.active && t.ms === 300000);
    budget[0].active = false;
    budget[0].fn();
    const done = h.doneMessages().map((m) => m[1]).pop();
    const missingCount = (done && done.missing ? done.missing.length : 0);
    check('K00-人工到期:未完成区域只计一次', missingCount === 1, { missing: done && done.missing });
    check('K00-人工到期:保留暂停前已回报快照', done && done.stats && done.stats.total === 3 && done.stats.filled === 2, done && done.stats);
    check('K00-人工到期:waiting-manual只计一次', done && done.terminalKinds && done.terminalKinds['waiting-manual'] === 1, done && done.terminalKinds);
    const stops = h.stopMessages().map((m) => m[1]);
    check('K00-STOP带runId与docId', stops.length === 1 && stops[0].runId === runId && stops[0].docId === 'top', stops);
    check('K00-STOP使用人工到期原因', stops.length === 1 && stops[0].reason === 'manual-timeout', stops[0] && stops[0].reason);
  }

  // ---------- K00:旧广播迟到失败不得取消新轮 ----------
  {
    const h = loadBackground();
    const firstRun = h.start();
    check('K00-旧广播已登记拒绝通道', h.rejectedBroadcasts.length === 1);
    const secondRun = h.start();
    // 先建立新轮，再让旧轮广播失败；必须等待 Promise.catch 真正进入宿主任务循环，
    // 之后才登记并收口新轮，否则“新轮已经完成”会让有缺陷的异常处理也假通过。
    h.rejectedBroadcasts[0](new Error('no-receiver'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.send({ type: 'FILL_REGISTER', runId: secondRun, docId: 'top' });
    h.send({ type: 'FILL_TERMINAL', runId: secondRun, docId: 'top', frameSeq: 1, stats: statsOf({ total: 2, filled: 2 }), items: [] });
    const seal = h.timers.filter((t) => t.active && t.ms === 700);
    seal[0].active = false; seal[0].fn();
    const done = h.doneMessages().map((m) => m[1]).pop();
    check('K00-旧广播失败不取消新轮', done && done.runId === secondRun && done.stats.total === 2, done && { runId: done.runId, total: done.stats && done.stats.total });
    check('K00-新旧轮runId不同', firstRun !== secondRun, { firstRun, secondRun });
  }

  // ---------- K01/K02:真实生产模块(合并优先序 + 旧诊断迁移) ----------
  {
    const source = buildSync({
      stdin: { contents: "export * as merge from './src/core/fill-merge'; export * as telemetry from './src/core/fill-telemetry';", resolveDir: root, loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', write: false,
    }).outputFiles[0].text;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', source)(mod, mod.exports, require);
    const { merge } = mod.exports;
    const { telemetry } = mod.exports;
    const st = (o) => statsOf(o);
    const item = (field, status, el) => ({ label: field, field, status, el });

    // 同一控件:旧 filled + 新 failed → 必须保留新失败
    {
      const control = {};
      const prev = { items: [item('basic.name', 'filled', control)], stats: st({ total: 1, filled: 1 }) };
      const round = { items: [item('basic.name', 'failed', control)], stats: st({ total: 1, failed: 1 }) };
      const merged = merge.mergeResumeResults(prev, round);
      const target = merged.items.find((i) => i.el === control) || merged.items[0];
      check('K01-新失败不被旧成功掩盖', target.status === 'failed', merged.items.map((i) => i.status));
      check('K01-合并统计与条目一致', merged.stats.total === merged.items.length && merged.stats.failed === 1, merged.stats);
    }
    // 同一控件:旧 filled + 新 picker(等待人工) → 必须保留新等待
    {
      const control = {};
      const prev = { items: [item('education.university', 'filled', control)], stats: st({ total: 1, filled: 1 }) };
      const round = { items: [item('education.university', 'picker', control)], stats: st({ total: 1, picker: 1 }) };
      const merged = merge.mergeResumeResults(prev, round);
      const target = merged.items.find((i) => i.el === control) || merged.items[0];
      check('K01-新等待不被旧成功掩盖', target.status === 'picker' && merged.stats.picker === 1, { status: target.status, stats: merged.stats });
    }
    // 旧目标本轮未重新确认 → 不得沿用旧成功;本轮新出现的目标正常保留
    {
      const stale = {};
      const fresh = {};
      const prev = { items: [item('basic.phone', 'filled', stale)], stats: st({ total: 1, filled: 1 }) };
      const round = { items: [item('basic.email', 'filled', fresh)], stats: st({ total: 1, filled: 1 }) };
      const merged = merge.mergeResumeResults(prev, round);
      const staleKept = merged.items.some((i) => i.el === stale && i.status === 'filled');
      check('K01-未重新确认的旧目标不沿用成功', staleKept === false, merged.items.map((i) => [i.field, i.status]));
    }
    // 同一字段可能映射到多个页面控件；续轮只重新确认 B 时，A 不能按字段名被静默吞掉。
    {
      const controlA = {};
      const controlB = {};
      const prev = {
        items: [item('basic.name', 'filled', controlA), item('basic.name', 'filled', controlB)],
        stats: st({ total: 2, filled: 2 }),
      };
      const round = { items: [item('basic.name', 'filled', controlB)], stats: st({ total: 1, filled: 1 }) };
      const merged = merge.mergeResumeResults(prev, round);
      const staleA = merged.items.find((i) => i.field === 'basic.name' && i.el === undefined && i.status === 'failed');
      check('K01-同字段另一控件不能冒充旧目标已确认', !!staleA, merged.items.map((i) => [i.field, i.status, i.el === controlB ? 'B' : i.el === undefined ? 'detached' : 'other']));
      check('K01-同字段双控件合并统计自洽', merged.items.length === 2 && merged.stats.total === 2 && merged.stats.filled === 1 && merged.stats.failed === 1, merged.stats);
    }

    // ---------- K02:旧诊断 runId 不得原文透传;时间边界拒绝 ----------
    const legacy = (over) => JSON.stringify(Object.assign({
      runId: 'PRIVATE_RUN_TOKEN', startedAt: 1, updatedAt: 2, stage: 'filling',
      counts: { total: 1, filled: 1 }, progress: { current: 1, total: 1 }, events: [],
    }, over || {}));
    const restored = telemetry.restoreFillTelemetryState(legacy(), 3);
    check('K02-旧runId不原文透传', !!restored && !JSON.stringify(restored).includes('PRIVATE_RUN_TOKEN'), restored && restored.runId);
    check('K02-旧runId重编码后仍可用于本地恢复', !!restored && typeof restored.runId === 'string' && restored.runId.length > 0);
    const future = telemetry.restoreFillTelemetryState(legacy({ updatedAt: 9_999_999_999 }), 3);
    check('K02-未来时间拒绝恢复', future === null, future && future.runId);
    const negative = telemetry.restoreFillTelemetryState(legacy({ updatedAt: -5 }), 3);
    check('K02-负时间拒绝恢复', negative === null);
    const reversed = telemetry.restoreFillTelemetryState(legacy({ startedAt: 5, updatedAt: 2 }), 3);
    check('K02-起止时间倒置拒绝恢复', reversed === null);
    const legal = telemetry.restoreFillTelemetryState(JSON.stringify({
      runId: 'r-ok', startedAt: 1, updatedAt: 2, stage: 'filling',
      counts: { total: 4, completed: 2, filled: 2, skipped: 0, failed: 0, waiting: 1 },
      progress: { current: 2, total: 4 },
      events: [{ sequence: 1, timestamp: 2, stage: 'filling', level: 'success', action: '已填写并回读通过', field: 'basic.phone', targetLabel: '手机号' }],
    }), 3);
    check('K02-合法旧诊断仍可恢复(计数/字段保留)', !!legal && legal.counts.total === 4 && legal.counts.filled === 2 && legal.events.length === 1 && legal.events[0].field === 'basic.phone', legal && { counts: legal.counts, field: legal.events[0] && legal.events[0].field });
  }
}

main().then(() => {
  fs.writeFileSync(path.join(__dirname, 'independent-probes.json'), JSON.stringify({ results, fails }, null, 2));
  for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
  console.log(`\n合计 ${results.length} 条,失败 ${fails.length} 条`);
  if (fails.length) process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

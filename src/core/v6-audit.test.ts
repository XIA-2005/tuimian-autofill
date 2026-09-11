// v6 审查反例自动测试(PLAN v6 · H00)
// 来源:docs/analysis/ds-v5-review-2026-09-09/audit-v5-probes.cjs 的复审1–7(脚本局部 ID,勿与 v3 R01–R24 混淆)。
// 原则:调用真实生产模块/编排与真实 background bundle;不重实现业务算法。
// H00 阶段:未修项预期失败,随 H01–H03 逐条转绿;不得改名/豁免/更新期望消问题。
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { makeDomIsolated } from '../../test/regression/observer';
import { emptyProfile } from './profile';
import { setProfileCode } from './profile';
import type { Profile } from './profile';
import { runFillPipeline } from './fill-pipeline';
import { SCHOOL_ADAPTER_PACKAGES } from './adapter-packages';
import type { AdapterFieldContract, SchoolAdapterPackage } from './adapters';
import { beginWriteScope, conditionalRestore, endWriteScope, fillAll, getWriteRecord, registerWriteOwnership } from './filler';
import { captureRunSnapshot, bumpProfileRevision, documentIdentity } from './fill-session';
import { resolveContractControl } from './control-drivers';
import { fillAdapterContractAsync } from './dependency-executor';
import { findNewAttributableError } from './task-executor';
import { SettleRegistry } from './settle-registry';
import { toPlainFillItem } from './fill-task';
import { RunAggregator } from '../background/aggregation';

const failures: string[] = [];
function test(name: string, cond: boolean, detail?: unknown): void {
  if (cond) return;
  failures.push(detail === undefined ? name : `${name} :: ${JSON.stringify(detail)}`);
}

/** 功能:构造审查用最小适配包(基于真实内置包结构,仅替换 match/pages)。 */
function auditPackage(fields: AdapterFieldContract[], id = 'v6-audit'): SchoolAdapterPackage {
  const base = SCHOOL_ADAPTER_PACKAGES[0];
  return {
    ...base,
    id,
    match: { hosts: ['audit.invalid'] },
    pages: [{ id: 'audit', name: 'audit', pathPatterns: ['*'], role: 'form', fields }],
    crawl: { mode: 'guided', pageOrder: ['audit'] },
  };
}

function withProfile(mutate: (p: Profile) => void): Profile {
  const p = emptyProfile();
  mutate(p);
  return p;
}

/** 功能:构建真实 background bundle 的 VM 入口,记录定时器与出站消息。 */
function loadBackground() {
  const source = buildSync({ entryPoints: ['src/background/index.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  let handler: ((msg: unknown, sender: unknown, respond: (r: unknown) => void) => void) | undefined;
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const messages: unknown[][] = [];
  vm.runInNewContext(source, {
    console,
    crypto: require('node:crypto').webcrypto,
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: () => undefined,
    chrome: {
      runtime: { onInstalled: { addListener: () => undefined }, onMessage: { addListener: (fn: typeof handler) => { handler = fn; } } },
      tabs: { sendMessage: async (...args: unknown[]) => { messages.push(args); } },
    },
  });
  return { handler, timers, messages };
}

export function runV6AuditTests(): void {
  const URL = 'https://audit.invalid/form';

  // ===== 复审1(脚本局部 R01):首项是合法值,不得被"首项=空"的推断覆盖 =====
  {
    const ctx = makeDomIsolated('<label>性别<select name="xb"><option value="男">男</option><option value="女">女</option></select></label>', URL);
    const select = ctx.doc.querySelector('select') as HTMLSelectElement;
    select.value = '男'; // 用户点选首项:浏览器不会写 selected 属性
    runFillPipeline(withProfile((p) => { p.basic.gender = '女'; }), ctx.doc, URL);
    test('v6-H01-首项合法值不得被覆盖', select.value === '男', { value: select.value });
    ctx.restore();
  }
  // 首项与档案同值 → 零写事件(不得因"首项=空"而重复 setter)。
  {
    const ctx = makeDomIsolated('<label>性别<select name="xb"><option value="男">男</option><option value="女">女</option></select></label>', URL);
    const select = ctx.doc.querySelector('select') as HTMLSelectElement;
    select.value = '男';
    let events = 0;
    ctx.doc.addEventListener('input', () => { events += 1; }, true);
    ctx.doc.addEventListener('change', () => { events += 1; }, true);
    runFillPipeline(withProfile((p) => { p.basic.gender = '男'; }), ctx.doc, URL);
    test('v6-H01-首项同值零写事件', events === 0, { events, value: select.value });
    ctx.restore();
  }
  // 占位首项仍照常填写(不得为修反例改成整页不填)。
  {
    const ctx = makeDomIsolated('<label>性别<select name="xb"><option value="">请选择</option><option value="男">男</option><option value="女">女</option></select></label>', URL);
    runFillPipeline(withProfile((p) => { p.basic.gender = '男'; }), ctx.doc, URL);
    const select = ctx.doc.querySelector('select') as HTMLSelectElement;
    test('v6-H01-占位首项照常填写', select.value === '男', { value: select.value });
    ctx.restore();
  }
  // 合同链同样不得覆盖首项合法值。
  {
    const ctx = makeDomIsolated('<select id="xb"><option value="男">男</option><option value="女">女</option></select>', URL);
    const select = ctx.doc.querySelector('select') as HTMLSelectElement;
    select.value = '男';
    const pack = auditPackage([{ nativeId: 'xb', profilePath: 'basic.gender', driver: 'native-select' }]);
    const trace = runFillPipeline(withProfile((p) => { p.basic.gender = '女'; }), ctx.doc, URL, { adapterPackage: pack });
    test('v6-H01-合同首项合法值不得被覆盖', select.value === '男', { value: select.value, items: trace.contractItems.map((i) => i.status) });
    ctx.restore();
  }
  // ===== 复审2(脚本局部 R02):label[for] 命中重复 id 必须整体判歧义 =====
  {
    const ctx = makeDomIsolated('<label for="xm">姓名</label><input id="xm"><input id="xm">', URL);
    const pack = auditPackage([{ labels: ['姓名'], profilePath: 'basic.name', driver: 'text' }]);
    runFillPipeline(withProfile((p) => { p.basic.name = 'PROFILE'; }), ctx.doc, URL, { adapterPackage: pack });
    const values = Array.from(ctx.doc.querySelectorAll('input')).map((el) => (el as HTMLInputElement).value);
    test('v6-H01-label重复ID两个均零写', values.every((v) => v === ''), { values });
    ctx.restore();
  }
  // 标签容器内多个控件 → 不得取首。
  {
    const ctx = makeDomIsolated('<label>姓名<input id="a"><input id="b"></label>', URL);
    const pack = auditPackage([{ labels: ['姓名'], profilePath: 'basic.name', driver: 'text' }]);
    runFillPipeline(withProfile((p) => { p.basic.name = 'PROFILE'; }), ctx.doc, URL, { adapterPackage: pack });
    const values = Array.from(ctx.doc.querySelectorAll('input')).map((el) => (el as HTMLInputElement).value);
    test('v6-H01-同标签多控件不猜', values.every((v) => v === ''), { values });
    ctx.restore();
  }
  // 无 name 的 radio 不得合成同一组(两个逻辑目标 → 歧义,零写)。
  {
    const ctx = makeDomIsolated('<label><input type="radio" value="男">男</label><label><input type="radio" value="女">女</label>', URL);
    const pack = auditPackage([{ selectors: ['input[type="radio"]'], profilePath: 'basic.gender', driver: 'radio' }]);
    runFillPipeline(withProfile((p) => { p.basic.gender = '男'; }), ctx.doc, URL, { adapterPackage: pack });
    const checked = Array.from(ctx.doc.querySelectorAll('input')).filter((el) => (el as HTMLInputElement).checked).length;
    const resolved = resolveContractControl(ctx.doc, { selectors: ['input[type="radio"]'], profilePath: 'basic.gender', driver: 'radio' });
    test('v6-H01-radio无name不合成一组', checked === 0 && resolved.ok === false, { checked, resolved: resolved.reason });
    ctx.restore();
  }

  // ===== 复审3(脚本局部 R03):同步入口遇依赖不得抢写子字段 =====
  {
    const ctx = makeDomIsolated('<input id="parent"><input id="child">', URL);
    const pack = auditPackage([
      { nativeId: 'parent', profilePath: 'education.university', driver: 'text' },
      { nativeId: 'child', profilePath: 'basic.phone', driver: 'text', dependsOn: ['education.university'] },
    ]);
    runFillPipeline(withProfile((p) => { p.education.university = 'MISSING'; p.basic.phone = '13800000000'; }), ctx.doc, URL, { adapterPackage: pack });
    const child = (ctx.doc.querySelector('#child') as HTMLInputElement).value;
    test('v6-H00-同步入口不得抢写依赖子字段', child === '', { child });
    ctx.restore();
  }

  // ===== 复审4(脚本局部 R04):旧档案修订的记录不得授权恢复 =====
  {
    const ctx = makeDomIsolated('<label>姓名<input name="xm"></label>', URL);
    const el = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    const runCtx = captureRunSnapshot(ctx.doc, URL, 'v6-old-revision');
    beginWriteScope(ctx.doc, runCtx);
    fillAll(withProfile((p) => { p.basic.name = 'PROFILE'; }), ctx.doc);
    endWriteScope();
    bumpProfileRevision(ctx.doc); // 档案修订提高 → 旧记录失效
    const verdict = conditionalRestore(ctx.doc, el, runCtx);
    test('v6-H02-旧修订记录不得授权恢复', verdict === 'notAttempted' && el.value === 'PROFILE', { verdict, value: el.value });
    ctx.restore();
  }
  // 跨轮记录不得恢复(旧 run 的记录不能被新轮 ctx 使用)。
  {
    const ctx = makeDomIsolated('<label>姓名<input name="xm"></label>', URL);
    const el = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    const oldRun = captureRunSnapshot(ctx.doc, URL, 'v6-run-old');
    beginWriteScope(ctx.doc, oldRun);
    fillAll(withProfile((p) => { p.basic.name = 'PROFILE'; }), ctx.doc);
    endWriteScope();
    const newRun = captureRunSnapshot(ctx.doc, URL, 'v6-run-new');
    const verdict = conditionalRestore(ctx.doc, el, newRun);
    test('v6-H02-跨轮记录不得授权恢复', verdict === 'notAttempted' && el.value === 'PROFILE', { verdict, value: el.value });
    ctx.restore();
  }
  // 登记为 text 但真实 input.type 是 date → 不得按文本恢复。
  {
    const ctx = makeDomIsolated('<input id="d" type="date">', URL);
    const el = ctx.doc.querySelector('#d') as HTMLInputElement;
    const runCtx = captureRunSnapshot(ctx.doc, URL, 'v6-date-type');
    beginWriteScope(ctx.doc, runCtx);
    el.value = '2026-09-10';
    registerWriteOwnership(ctx.doc, el, '2026-09-10', 'text');
    endWriteScope();
    const verdict = conditionalRestore(ctx.doc, el, runCtx);
    test('v6-H02-真实input.type非文本不得恢复', verdict === 'notAttempted' && el.value === '2026-09-10', { verdict, value: el.value });
    ctx.restore();
  }
  // 合法当前轮文本仍可实际恢复(不得为修反例把恢复关死)。
  {
    const ctx = makeDomIsolated('<label>姓名<input name="xm"></label>', URL);
    const el = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    const runCtx = captureRunSnapshot(ctx.doc, URL, 'v6-legal-restore');
    beginWriteScope(ctx.doc, runCtx);
    fillAll(withProfile((p) => { p.basic.name = 'PROFILE'; }), ctx.doc);
    endWriteScope();
    const verdict = conditionalRestore(ctx.doc, el, runCtx);
    test('v6-H02-合法当前轮文本可恢复', verdict === 'restored' && el.value === '', { verdict, value: el.value });
    ctx.restore();
  }

  // ===== 复审5(脚本局部 R05):通信文档身份不得跨实例重启 =====
  {
    const buildSessionBundle = (): { documentIdentity: (doc: Document) => string } => {
      const source = buildSync({
        stdin: { contents: "export * as session from './src/core/fill-session';", resolveDir: process.cwd(), loader: 'ts' },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
      }).outputFiles[0].text;
      const mod: { exports: unknown } = { exports: {} };
      new Function('module', 'exports', 'require', source)(mod, mod.exports, require);
      return (mod.exports as { session: { documentIdentity: (doc: Document) => string } }).session;
    };
    const ctx = makeDomIsolated('<input>', URL);
    const first = buildSessionBundle();
    const second = buildSessionBundle();
    const id1 = first.documentIdentity(ctx.doc);
    const id2 = second.documentIdentity(ctx.doc);
    test('v6-H03-通信文档身份跨实例不同', id1 !== id2 && !/^doc1$/.test(id1), { id1, id2 });
    ctx.restore();
  }

  // ===== 复审6(脚本局部 R06):被拒终态不得改变完成标志(回归) =====
  {
    const g = new RunAggregator('CURRENT');
    g.register(0, 'doc');
    const rejected = g.terminalize({ runId: 'OLD', frameId: 0, docId: 'doc', frameSeq: 1, stats: { total: 1, filled: 1, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 }, items: [] });
    test('v6-H00-被拒终态不得改变完成标志', rejected === false && g.allTerminal() === false, { rejected, allTerminal: g.allTerminal() });
  }

  // ===== 复审7(脚本局部 R07):注册未封口不得提前完成 =====
  {
    const { handler, timers, messages } = loadBackground();
    handler?.({ type: 'PANEL_FILL' }, { tab: { id: 9 } }, () => undefined);
    const runId = (messages[0][1] as { runId: string }).runId;
    const stats = { total: 1, filled: 1, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 };
    const send = (type: string, frameId: number): void => {
      handler?.({ type, runId, docId: `doc-${frameId}`, frameSeq: 1, stats, items: [] }, { tab: { id: 9 }, frameId }, () => undefined);
    };
    send('FILL_REGISTER', 0);
    send('FILL_TERMINAL', 0);
    const doneBeforeSecond = messages.some((m) => (m[1] as { type: string }).type === 'FILL_DONE');
    send('FILL_REGISTER', 1);
    const doneAfterSecondRegistration = messages.some((m) => (m[1] as { type: string }).type === 'FILL_DONE');
    const sealTimer = timers.find((t) => t.ms === 700);
    sealTimer?.fn(); // 封口:此时帧 1 未终态,仍不得完成
    const doneAtSeal = messages.some((m) => (m[1] as { type: string }).type === 'FILL_DONE');
    send('FILL_TERMINAL', 1);
    const done = messages.find((m) => (m[1] as { type: string }).type === 'FILL_DONE')?.[1] as
      | { participants?: number; framesReported?: number; stats?: { filled?: number } }
      | undefined;
    test('v6-H03-注册未封口不得提前完成', doneBeforeSecond === false && doneAfterSecondRegistration === false && doneAtSeal === false, { doneBeforeSecond, doneAfterSecondRegistration, doneAtSeal });
    test('v6-H03-晚注册帧必须计入完成汇总', done?.participants === 2 && done?.framesReported === 2 && done?.stats?.filled === 2, { done });
  }

  // H04:短 id 不得作为子串命中其他字段的错误文案;同 id 作为独立词元仍须命中。
  {
    const ctx = makeDomIsolated('<input id="hm" name="hm"><div class="err">zjhm 证件号码格式错误</div>', URL);
    const el = ctx.doc.querySelector('#hm') as HTMLInputElement;
    test('v6-H04-短id不得命中他字段错误', findNewAttributableError(ctx.doc, el, ['.err'], []) === null, { hit: findNewAttributableError(ctx.doc, el, ['.err'], []) });
    ctx.restore();
  }
  {
    const ctx = makeDomIsolated('<input id="zjhm" name="zjhm"><div class="err">zjhm 证件号码格式错误</div>', URL);
    const el = ctx.doc.querySelector('#zjhm') as HTMLInputElement;
    const hit = findNewAttributableError(ctx.doc, el, ['.err'], []);
    test('v6-H04-独立词元仍可归因', hit?.isNew === true, { hit });
    ctx.restore();
  }

  // ===== H03.4:终态类别(等待人工/完成/取消)与跨 frame 边界 =====
  {
    const g = new RunAggregator('R');
    g.register(0, 'a');
    g.register(1, 'b');
    const st = { total: 1, filled: 1, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 };
    g.terminalize({ runId: 'R', frameId: 0, docId: 'a', frameSeq: 1, stats: st, items: [], terminalKind: 'waiting-manual' });
    g.terminalize({ runId: 'R', frameId: 1, docId: 'b', frameSeq: 1, stats: st, items: [] });
    const sum = g.summarize();
    test('v6-H03-终态类别计数', sum.terminalKinds['waiting-manual'] === 1 && sum.terminalKinds['done'] === 1, sum.terminalKinds);
  }
  // 真实 background:乱序/重复 seq 拒绝、同帧新旧文档分开、终态类别透传。
  {
    const { handler, timers, messages } = loadBackground();
    handler?.({ type: 'PANEL_FILL' }, { tab: { id: 21 } }, () => undefined);
    const runId = (messages[0][1] as { runId: string }).runId;
    const stats = (filled: number) => ({ total: 1, filled, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 });
    const send = (type: string, frameId: number, docId: string, frameSeq: number, filled: number, terminalKind?: string): void => {
      handler?.({ type, runId, docId, frameSeq, stats: stats(filled), items: [], ...(terminalKind ? { terminalKind } : {}) }, { tab: { id: 21 }, frameId }, () => undefined);
    };
    send('FILL_REGISTER', 0, 'docA', 1, 0);
    send('FILL_RESULT', 0, 'docA', 2, 1);
    send('FILL_RESULT', 0, 'docA', 1, 9); // 乱序旧 seq → 必须拒绝
    send('FILL_RESULT', 0, 'docA', 2, 9); // 重复 seq → 必须拒绝
    send('FILL_TERMINAL', 0, 'docA', 3, 1, 'waiting-manual');
    send('FILL_REGISTER', 0, 'docB', 1, 0); // 同 frame 的旧文档回报必须与新文档分开
    send('FILL_TERMINAL', 0, 'docB', 1, 1);
    timers.find((t) => t.ms === 700)?.fn();
    const done = messages.find((m) => (m[1] as { type: string }).type === 'FILL_DONE')?.[1] as
      | { participants?: number; stats?: { filled?: number }; terminalKinds?: Record<string, number> }
      | undefined;
    test('v6-H03-乱序与重复seq被拒绝', done?.stats?.filled === 2, { filled: done?.stats?.filled });
    test('v6-H03-同帧新旧文档分开计数', done?.participants === 2, { participants: done?.participants });
    test('v6-H03-终态类别透传', done?.terminalKinds?.['waiting-manual'] === 1 && done?.terminalKinds?.['done'] === 1, { kinds: done?.terminalKinds });
  }
  // 新轮替换旧轮:旧调用方必须收到显式取消,不得静默悬挂。
  {
    const { handler, messages } = loadBackground();
    const responds: unknown[] = [];
    handler?.({ type: 'PANEL_FILL' }, { tab: { id: 31 } }, (r) => responds.push(r));
    const firstRun = (messages[0][1] as { runId: string }).runId;
    handler?.({ type: 'PANEL_FILL' }, { tab: { id: 31 } }, (r) => responds.push(r));
    test(
      'v6-H03-新轮替换旧轮显式取消',
      responds.some((r) => (r as { terminalKind?: string }).terminalKind === 'cancelled' && (r as { runId?: string }).runId === firstRun),
      { responds },
    );
  }

  // ===== H04:单轮多个补填阶段的 pending 验证不得被后来者覆盖丢弃 =====
  {
    const registry = new SettleRegistry<{ id: string }>();
    const first = registry.register('runA', [{ id: 'first' }], { total: 1 }, null);
    const second = registry.register('runA', [{ id: 'second' }], { total: 2 }, null);
    const taken = registry.take(first);
    test('v6-H04-较早阶段的settle不被覆盖', taken?.items[0]?.id === 'first' && registry.size() === 1, { taken: taken?.items, size: registry.size() });
    test('v6-H04-已取出的settle不重复', registry.take(first) === null);
    const consumed = registry.consumeRun('runA');
    test('v6-H04-收口取回剩余阶段', consumed.length === 1 && consumed[0].token === second.token && registry.size() === 0, { consumed: consumed.length });
  }

  // 写入记录必须绑定轮次身份(H02 数据面)。
  {
    const ctx = makeDomIsolated('<label>姓名<input name="xm"></label>', URL);
    const el = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    const runCtx = captureRunSnapshot(ctx.doc, URL, 'v6-record-scope');
    beginWriteScope(ctx.doc, runCtx);
    fillAll(withProfile((p) => { p.basic.name = 'PROFILE'; }), ctx.doc);
    endWriteScope();
    const rec = getWriteRecord(ctx.doc, el);
    test('v6-H02-写入记录含原轮与修订', !!rec && rec.runId === runCtx.runId && rec.revision === runCtx.profileRevision && rec.epoch === runCtx.epoch, rec);
    ctx.restore();
  }

  // ===== H05:DTO 不得携带页面标签原文/资料值(reason 不跨上下文传输) =====
  {
    const dto = toPlainFillItem({ label: '父亲姓名：张三', field: 'familyMembers[0].name', status: 'failed', reason: '身份证 210211200305011233 格式错误', valuePreview: '210211200305011233' });
    const json = JSON.stringify(dto);
    test('v6-H05-DTO不得携带页面标签与reason', !json.includes('张三') && !json.includes('210211200305011233') && dto.reason === undefined && dto.label === '家庭成员 · 第 1 行', dto);
  }
  // 接收端同样不信任发送端 label/reason(即使发送端是旧版本或被篡改)。
  {
    const { handler, timers, messages } = loadBackground();
    handler?.({ type: 'PANEL_FILL' }, { tab: { id: 11 } }, () => undefined);
    const runId = (messages[0][1] as { runId: string }).runId;
    const stats = { total: 1, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 1, picker: 0, pickerResumeCount: 0 };
    handler?.({
      type: 'FILL_TERMINAL', runId, docId: 'doc-0', frameSeq: 1, stats,
      items: [{ label: '父亲姓名：张三', field: 'familyMembers[0].name', status: 'failed', reason: '身份证 210211200305011233 格式错误' }],
    }, { tab: { id: 11 }, frameId: 0 }, () => undefined);
    timers.find((t) => t.ms === 700)?.fn();
    const done = messages.find((m) => (m[1] as { type: string }).type === 'FILL_DONE')?.[1] as { items?: Array<{ label?: string; reason?: string }> } | undefined;
    const doneJson = JSON.stringify(done?.items || []);
    test('v6-H05-接收端剥离页面标签与reason', !doneJson.includes('张三') && !doneJson.includes('210211200305011233') && !doneJson.includes('reason'), { items: done?.items });
  }
}

export function getV6AuditFailures(): string[] {
  return failures;
}

/**
 * 功能:v6 中必须经异步依赖入口验证的用例(同步入口遇依赖页只返回待异步处理)。
 */
export async function runV6AuditAsyncTests(): Promise<void> {
  const URL = 'https://audit.invalid/form';
  // H04:声明式依赖中 picker waiting 不得放行子项(父未验证成功 → 子零写)。
  {
    const ctx = makeDomIsolated('<input id="univ"><input id="univCode"><input id="univName"><input id="child">', URL);
    try {
      const pack = auditPackage([
        { nativeId: 'univ', profilePath: 'education.university', driver: 'school-picker', codeSelectors: ['#univCode'], nameSelectors: ['#univName'] },
        { nativeId: 'child', profilePath: 'basic.phone', driver: 'text', dependsOn: ['education.university'] },
      ]);
      const profile = withProfile((p) => { p.education.university = '测试大学'; p.basic.phone = '13800000000'; });
      const items = await fillAdapterContractAsync(profile, ctx.doc, URL, pack, { stillActive: () => true });
      const parent = items.find((i) => i.profilePath === 'education.university');
      const child = (ctx.doc.querySelector('#child') as HTMLInputElement).value;
      test('v6-H04-picker等待不放行子项', parent?.dependencyState === 'waiting' && child === '', { parent: parent?.dependencyState, child });
    } finally {
      ctx.restore();
    }
  }
  // H04:人工接管完成后,在有效轮次重新验证并继续(父 picker 完成后子项放行)。
  {
    const ctx = makeDomIsolated('<input id="univ"><input id="univCode"><input id="univName"><input id="child">', URL);
    try {
      const pack = auditPackage([
        { nativeId: 'univ', profilePath: 'education.university', driver: 'school-picker', codeNamespace: 'moe.school', codeSelectors: ['#univCode'], nameSelectors: ['#univName'] },
        { nativeId: 'child', profilePath: 'basic.phone', driver: 'text', dependsOn: ['education.university'] },
      ]);
      const profile = withProfile((p) => {
        p.education.university = '测试大学';
        p.basic.phone = '13800000000';
        setProfileCode(p, 'education.university', 'moe.school', '10700', '测试大学');
      });
      const first = await fillAdapterContractAsync(profile, ctx.doc, URL, pack, { stillActive: () => true });
      const parentFirst = first.find((i) => i.profilePath === 'education.university');
      const childEl = ctx.doc.querySelector('#child') as HTMLInputElement;
      test('v6-H04-人工前子项零写', parentFirst?.dependencyState === 'waiting' && childEl.value === '', { state: parentFirst?.dependencyState, child: childEl.value });
      // 模拟人工接管完成:代码/名称载体被人工成对写入正确值 → 有效轮次重新验证后放行子项。
      (ctx.doc.querySelector('#univCode') as HTMLInputElement).value = '10700';
      (ctx.doc.querySelector('#univName') as HTMLInputElement).value = '测试大学';
      const second = await fillAdapterContractAsync(profile, ctx.doc, URL, pack, { stillActive: () => true });
      const parentSecond = second.find((i) => i.profilePath === 'education.university');
      test('v6-H04-人工完成后重新验证并继续', parentSecond?.dependencyState === 'verified' && childEl.value === '13800000000', { state: parentSecond?.dependencyState, child: childEl.value });
    } finally {
      ctx.restore();
    }
  }
}

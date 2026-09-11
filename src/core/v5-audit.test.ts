// v5 审查反例自动测试(PLAN v5 · G00)
// 来源:docs/analysis/ds-v4-review-2026-09-09/audit-probes-v4.cjs 的 V01–V07。
// 原则:调用真实生产编排 runFillPipeline(合同→通用→合并)与真实模块;不重实现业务算法。
// 说明:本套件在 G00 阶段预期全部失败(基线);随 G01–G09 修复逐条转绿,不得改名/豁免。
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { makeDomIsolated } from '../../test/regression/observer';
import { emptyProfile } from './profile';
import type { Profile } from './profile';
import { runFillPipeline, runFillPipelineAsync } from './fill-pipeline';
import { SCHOOL_ADAPTER_PACKAGES } from './adapter-packages';
import type { AdapterFieldContract, SchoolAdapterPackage } from './adapters';
import { captureBeforeValue, clearPageFill, conditionalRestore, getOwnedValue, getWriteRecord, noteExternalInput } from './filler';
import { captureRunSnapshot, isRunStillActive } from './fill-session';
import { routeKeyFor } from './fill-task';

const failures: string[] = [];
function test(name: string, cond: boolean, detail?: unknown): void {
  if (cond) return;
  failures.push(detail === undefined ? name : `${name} :: ${JSON.stringify(detail)}`);
}

/** 功能:构造审查用最小适配包(基于真实内置包结构,仅替换 match/pages)。 */
function auditPackage(fields: AdapterFieldContract[], id = 'audit'): SchoolAdapterPackage {
  const base = SCHOOL_ADAPTER_PACKAGES[0];
  return {
    ...base,
    id,
    match: { hosts: ['audit.invalid'] },
    pages: [{ id: 'audit', name: 'audit', pathPatterns: ['*'], role: 'form', fields }],
    crawl: { mode: 'guided', pageOrder: ['audit'] },
  };
}

function withName(profile: Profile, name: string): Profile {
  profile.basic.name = name;
  return profile;
}

export function runV5AuditTests(): void {
  const URL = 'https://audit.invalid/form';
  // V01:合同空姓名 → 唯一目标、唯一结果、有所有权、清除可清。
  {
    const ctx = makeDomIsolated('<label for="xm">姓名</label><input id="xm" name="xm">', URL);
    const el = ctx.doc.querySelector('#xm') as HTMLInputElement;
    const pack = auditPackage([{ nativeId: 'xm', profilePath: 'basic.name', driver: 'text' }]);
    const trace = runFillPipeline(withName(emptyProfile(), 'PROFILE'), ctx.doc, URL, { adapterPackage: pack });
    const statuses = trace.result.items.filter((i) => i.el === el).map((i) => i.status);
    test('V01: 同一目标只有一个 outcome', statuses.length === 1, { statuses });
    test('V01: total 按目标数计(1)', trace.result.stats.total === 1, { total: trace.result.stats.total });
    test('V01: 合同写入登记所有权', getOwnedValue(ctx.doc, el) === 'PROFILE', { owned: getOwnedValue(ctx.doc, el) ?? null });
    const cleared = clearPageFill(ctx.doc);
    test('V01: 清除可清合同写入', cleared >= 1 && el.value === '', { cleared, value: el.value });
    ctx.restore();
  }
  // V02:重复 ID 歧义 → 整链(含通用)都不得写。
  {
    const ctx = makeDomIsolated('<label>姓名<input id="xm" name="xm"></label><label>姓名<input id="xm" name="xm"></label>', URL);
    const pack = auditPackage([{ nativeId: 'xm', profilePath: 'basic.name', driver: 'text' }]);
    runFillPipeline(withName(emptyProfile(), 'PROFILE'), ctx.doc, URL, { adapterPackage: pack });
    const values = Array.from(ctx.doc.querySelectorAll('input')).map((e) => (e as HTMLInputElement).value);
    test('V02: 歧义候选通用链也不写', values.every((v) => v === ''), { values });
    ctx.restore();
  }
  // G01:合同字段在页面缺失时必须留下可见失败(不能因无 el 被丢弃)。
  {
    const ctx = makeDomIsolated('<input id="other">', URL);
    const pack = auditPackage([{ nativeId: 'missing-id', profilePath: 'basic.name', driver: 'text' }]);
    const trace = runFillPipeline(withName(emptyProfile(), 'PROFILE'), ctx.doc, URL, { adapterPackage: pack });
    const failed = trace.result.items.filter((i) => i.field === 'basic.name' && i.status === 'failed');
    test('G01: 合同缺失字段保留可见失败结果', failed.length === 1, { items: trace.result.items.map((i) => ({ f: i.field, s: i.status })) });
    ctx.restore();
  }
  // G01:歧义阻塞只影响歧义目标,独立字段照常填写。
  {
    const ctx = makeDomIsolated('<label>姓名<input id="xm" name="xm"></label><label>姓名<input id="xm" name="xm"></label><input name="email">', URL);
    const pack = auditPackage([{ nativeId: 'xm', profilePath: 'basic.name', driver: 'text' }]);
    const profile = emptyProfile();
    profile.basic.name = 'PROFILE';
    profile.basic.email = 'a@b.example';
    runFillPipeline(profile, ctx.doc, URL, { adapterPackage: pack });
    const email = (ctx.doc.querySelector('[name="email"]') as HTMLInputElement).value;
    test('G01: 歧义目标被阻塞时独立字段照常', email === 'a@b.example', { email });
    ctx.restore();
  }
  // G01:同 name radio 分布在两个 form → 不得串组(只操作所属 form)。
  {
    const ctx = makeDomIsolated(
      '<form id="f1"><label><input type="radio" name="xb" value="男">男</label><label><input type="radio" name="xb" value="女">女</label></form>' +
      '<form id="f2"><label><input type="radio" name="xb" value="男">男</label><label><input type="radio" name="xb" value="女" checked>女</label></form>',
      URL,
    );
    const pack = auditPackage([{ selectors: ['#f1 input[name="xb"]'], profilePath: 'basic.gender', driver: 'radio' }]);
    const profile = emptyProfile();
    profile.basic.gender = '男';
    runFillPipeline(profile, ctx.doc, URL, { adapterPackage: pack });
    const f1male = (ctx.doc.querySelector('#f1 input[value="男"]') as HTMLInputElement).checked;
    const f2female = (ctx.doc.querySelector('#f2 input[value="女"]') as HTMLInputElement).checked;
    test('G01: 同 name 不同 form 不串组(f1 男被选, f2 女保持)', f1male === true && f2female === true, { f1male, f2female });
    ctx.restore();
  }
  // G02:用户改动后即使值又相同,也不得恢复可清除权限。
  {
    const ctx = makeDomIsolated('<label for="xm">姓名</label><input id="xm" name="xm">', URL);
    const el = ctx.doc.querySelector('#xm') as HTMLInputElement;
    const pack = auditPackage([{ nativeId: 'xm', profilePath: 'basic.name', driver: 'text' }]);
    runFillPipeline(withName(emptyProfile(), 'PROFILE'), ctx.doc, URL, { adapterPackage: pack });
    // 模拟用户编辑(非扩展写入):值改回相同也不得恢复清除权限。
    noteExternalInput(el);
    el.value = 'PROFILE';
    const cleared = clearPageFill(ctx.doc);
    test('G02: 用户干预后即使值相同也不误清', cleared === 0 && el.value === 'PROFILE', { cleared, value: el.value });
    ctx.restore();
  }
  // G02:页面原有同值(未写入)不授予所有权 → 清除不清。
  {
    const ctx = makeDomIsolated('<label for="xm">姓名</label><input id="xm" name="xm" value="SAME">', URL);
    const el = ctx.doc.querySelector('#xm') as HTMLInputElement;
    const pack = auditPackage([{ nativeId: 'xm', profilePath: 'basic.name', driver: 'text' }]);
    runFillPipeline(withName(emptyProfile(), 'SAME'), ctx.doc, URL, { adapterPackage: pack });
    const cleared = clearPageFill(ctx.doc);
    test('G02: 页面原有同值不授予所有权(清除不清)', cleared === 0 && el.value === 'SAME', { cleared, value: el.value });
    ctx.restore();
  }
  // G02:各受支持驱动的三联(空值必填/同值零事件/不同值保留)。
  {
    // 文本
    const ctx1 = makeDomIsolated('<input name="xm">', URL);
    const p1 = emptyProfile(); p1.basic.name = 'N';
    runFillPipeline(p1, ctx1.doc, URL, { adapterPackage: auditPackage([{ selectors: ['[name="xm"]'], profilePath: 'basic.name', driver: 'text' }]) });
    test('G02-text: 空值必填', (ctx1.doc.querySelector('[name="xm"]') as HTMLInputElement).value === 'N');
    ctx1.restore();
    // 原生 select
    const ctx2 = makeDomIsolated('<select name="xb"><option value="">请选择</option><option>男</option><option>女</option></select>', URL);
    const p2 = emptyProfile(); p2.basic.gender = '男';
    runFillPipeline(p2, ctx2.doc, URL, { adapterPackage: auditPackage([{ selectors: ['[name="xb"]'], profilePath: 'basic.gender', driver: 'native-select' }]) });
    test('G02-select: 空值必填(占位视为空)', (ctx2.doc.querySelector('[name="xb"]') as HTMLSelectElement).value === '男');
    ctx2.restore();
    // 同值零事件(select 已选相同)
    const ctx3 = makeDomIsolated('<select name="xb"><option value="">请选择</option><option selected>男</option></select>', URL);
    const p3 = emptyProfile(); p3.basic.gender = '男';
    let events3 = 0;
    ctx3.doc.addEventListener('input', () => events3 += 1, true);
    ctx3.doc.addEventListener('change', () => events3 += 1, true);
    runFillPipeline(p3, ctx3.doc, URL, { adapterPackage: auditPackage([{ selectors: ['[name="xb"]'], profilePath: 'basic.gender', driver: 'native-select' }]) });
    test('G02-select: 同值零事件', events3 === 0, { events3 });
    ctx3.restore();
    // 不同值保留(radio)
    const ctx4 = makeDomIsolated('<form><label><input type="radio" name="xb" value="男">男</label><label><input type="radio" name="xb" value="女" checked>女</label></form>', URL);
    const p4 = emptyProfile(); p4.basic.gender = '男';
    runFillPipeline(p4, ctx4.doc, URL, { adapterPackage: auditPackage([{ selectors: ['input[name="xb"]'], profilePath: 'basic.gender', driver: 'radio' }]) });
    test('G02-radio: 不同值保留', (ctx4.doc.querySelector('input[value="女"]') as HTMLInputElement).checked === true);
    ctx4.restore();
  }
  // V03:driver=school-picker 但实际是 select → 已有值保护不得被驱动类型绕过。
  {
    const ctx = makeDomIsolated('<select id="univ"><option value="OLD" selected>OLD UNIVERSITY</option><option value="NEW">NEW UNIVERSITY</option></select>', URL);
    const pack = auditPackage([{ nativeId: 'univ', profilePath: 'education.university', driver: 'school-picker' }]);
    const profile = emptyProfile();
    profile.education.university = 'NEW UNIVERSITY';
    runFillPipeline(profile, ctx.doc, URL, { adapterPackage: pack });
    const value = (ctx.doc.querySelector('select') as HTMLSelectElement).value;
    test('V03: select 已有不同值保留(不被 school-picker 绕过)', value === 'OLD', { value });
    ctx.restore();
  }
  // V04:父字段空/冲突时,依赖者不得写入(合同层 + 通用层)。
  for (const mode of ['empty', 'conflict'] as const) {
    const ctx = makeDomIsolated('<input id="parent" value="OLD"><input id="child">', URL);
    const pack = auditPackage([
      { nativeId: 'parent', profilePath: 'basic.name', driver: 'text' },
      { nativeId: 'child', profilePath: 'basic.phone', driver: 'text', dependsOn: ['basic.name'] },
    ]);
    const profile = emptyProfile();
    profile.basic.name = mode === 'empty' ? '' : 'NEW';
    profile.basic.phone = '13800000000';
    runFillPipeline(profile, ctx.doc, URL, { adapterPackage: pack });
    const child = (ctx.doc.querySelector('#child') as HTMLInputElement).value;
    test(`V04-${mode}: 父未成功时子字段不得写入`, child === '', { child, parent: (ctx.doc.querySelector('#parent') as HTMLInputElement).value });
    ctx.restore();
  }
  // G06:真实写入 + 页面报关联错误 → 恢复写前空值(可逆文本驱动)。
  {
    const ctx = makeDomIsolated('<input id="zjhm" name="zjhm">', URL);
    const el = ctx.doc.querySelector('#zjhm') as HTMLInputElement;
    const pack = auditPackage([{ nativeId: 'zjhm', profilePath: 'basic.idCard', driver: 'text' }]);
    const profile = emptyProfile();
    profile.basic.idCard = '210211200305011233';
    // H02:写入记录与恢复都必须绑定同一原轮 ctx(缺 ctx 或跨轮一律 notAttempted)。
    const runCtx = captureRunSnapshot(ctx.doc, URL, 'v5-g06');
    runFillPipeline(profile, ctx.doc, URL, { adapterPackage: pack, run: runCtx });
    const rec = getWriteRecord(ctx.doc, el);
    test('G06: 合同文本写入产生记录', !!rec && rec.driver === 'text' && rec.after === '210211200305011233' && rec.before === '', rec);
    const verdict = conditionalRestore(ctx.doc, el, runCtx);
    test('G06: 可归因失败时恢复写前空值', verdict === 'restored' && el.value === '', { verdict, value: el.value });
    ctx.restore();
  }
  // G07a:父字段"页面已有同值"(已验证等价)→ 不阻塞合法子项。
  // H00:依赖页面必须走异步入口(同步入口只返回待异步处理,不得抢写),因此本用例移入 runV5AuditAsyncTests。
  // V05:无所有权时不得恢复(用户值必须保留)。
  {
    const ctx = makeDomIsolated('<input id="x">', URL);
    const el = ctx.doc.querySelector('#x') as HTMLInputElement;
    captureBeforeValue(ctx.doc, el);
    el.value = 'USER_VALUE';
    const verdict = conditionalRestore(ctx.doc, el, null);
    test('V05: 无所有权不恢复用户值', verdict !== 'restored' && el.value === 'USER_VALUE', { verdict, value: el.value });
    ctx.restore();
  }
  // V06:生产守卫 isRunStillActive——A 轮排队的回调在 B 轮启动后不得获准。
  {
    const ctx = makeDomIsolated('<input>', URL);
    const queuedA = captureRunSnapshot(ctx.doc, URL, 'A');
    const currentB = captureRunSnapshot(ctx.doc, URL, 'B');
    test('V06: A 回调在 B 轮不得获准', isRunStillActive(queuedA, currentB, ctx.doc, URL) === false);
    test('V06: 同轮仍获准', isRunStillActive(queuedA, queuedA, ctx.doc, URL) === true);
    // 导航(路由变化)后同轮也失效。
    const otherUrl = 'https://audit.invalid/other';
    test('V06: 路由变化使旧轮失效', isRunStillActive(queuedA, queuedA, ctx.doc, otherUrl) === false);
    ctx.restore();
  }
  // V07:background 必须按参与者终态收口(无终态不得算完成;DTO 不得转发私密字段)。
  {
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
    handler?.({ type: 'PANEL_FILL' }, { tab: { id: 7 } }, () => undefined);
    const runId = (messages[0][1] as { runId: string }).runId;
    const stats = { total: 1, filled: 1, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 };
    handler?.({ type: 'FILL_RESULT', runId, frameSeq: 1, stats, items: [{ label: 'x', field: 'basic.name', status: 'filled', valuePreview: 'SYNTHETIC_PRIVATE_VALUE' }] }, { tab: { id: 7 }, frameId: 0 }, () => undefined);
    timers[0]?.fn();
    const done = messages.find((m) => (m[1] as { type: string }).type === 'FILL_DONE')?.[1] as
      | { timedOut?: boolean; stats?: { filled?: number; failed?: number }; items?: Array<{ valuePreview?: string }> }
      | undefined;
    test('V07: 无终态参与者不得报告完成', done?.timedOut === true, { timedOut: done?.timedOut });
    test('V07: DTO 不得转发私密字段', !done?.items?.some((i) => i.valuePreview !== undefined), { items: done?.items });
  }
  // Q09 剩余:路由键不得保留 pathname 动态令牌。
  {
    const key = routeKeyFor('https://audit.invalid/ssxly/FAKE_PRIVATE_TOKEN');
    test('Q09: 路由键不保留动态路径令牌', !key.includes('FAKE_PRIVATE_TOKEN'), { key });
  }
}

export function getV5AuditFailures(): string[] {
  return failures;
}

/**
 * 功能:v5 反例中必须经异步依赖入口验证的用例(H00 后同步入口不再执行依赖页)。
 * 说明:断言语义与原 G07a 用例一致——父字段"页面已有同值"不得阻塞合法子项。
 */
export async function runV5AuditAsyncTests(): Promise<void> {
  const URL = 'https://audit.invalid/form';
  const ctx = makeDomIsolated('<input id="parent" value="SAME"><input id="child">', URL);
  try {
    const pack = auditPackage([
      { nativeId: 'parent', profilePath: 'basic.name', driver: 'text' },
      { nativeId: 'child', profilePath: 'basic.phone', driver: 'text', dependsOn: ['basic.name'] },
    ]);
    const profile = emptyProfile();
    profile.basic.name = 'SAME';
    profile.basic.phone = '13800000000';
    const runCtx = captureRunSnapshot(ctx.doc, URL, 'v5-g07a-async');
    await runFillPipelineAsync(profile, ctx.doc, URL, { adapterPackage: pack, run: runCtx, stillActive: () => true });
    const child = (ctx.doc.querySelector('#child') as HTMLInputElement).value;
    test('G07a: 父同值不阻塞合法子项(异步入口)', child === '13800000000', { child });
  } finally {
    ctx.restore();
  }
}

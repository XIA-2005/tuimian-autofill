// A1 · 事件策略层测试 + INV-A1 五条不变量负向断言（改动即 exit≠0）。
// INV-A1-a registerWriteOwnership 登记时机与内容不变；
// INV-A1-b conditionalRestore 各道门语义不变（尤其 driver==='text' 门）；
// INV-A1-c _valueTracker 清理不得改变 settle 稳定回读结论；
// INV-A1-d 事件集合变化不得改变 readNativeControlValue 读数；
// INV-A1-e B4 继承不变量：RETIRED_DRIVERS→E1301 守卫、issueCode 透传、E1301 码表（+check:adapters 常驻用例）。
import { makeDomIsolated } from '../../test/regression/observer';
import { emptyProfile } from './profile';
import type { Profile } from './profile';
import { captureRunSnapshot } from './fill-session';
import { beginWriteScope, conditionalRestore, endWriteScope, getWriteRecord, noteExternalInput, readNativeControlValue, registerWriteOwnership, setInputValue } from './filler';
import { dispatchForcedChange, dispatchValueEvents, isAspLikePage, resolveEventPolicy } from './event-policy';
import type { EventPolicy, ValueEventTail } from './event-policy';
import { fillAdapterContract } from './control-drivers';
import type { SchoolAdapterPackage } from './adapters';
import { mergeContractFillResult } from './fill-merge';
import { ISSUE_CATALOG, issueMeta } from './error-codes';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

const URL = 'https://inv-a1.invalid/form';

function profileNamed(name: string): Profile {
  const p = emptyProfile();
  p.basic.name = name;
  return p;
}

export function runEventPolicyTests(): void {
  // ===== 策略解析与派发语义 =====
  {
    test('A1: 策略解析——缺省 full', resolveEventPolicy({}) === 'full');
    test('A1: 合同声明覆盖最高优先', resolveEventPolicy({ declared: 'silent', aspPage: true, field: 'education.gpa' }) === 'silent');
    test('A1: ASP 页 × 风险字段 → soft', resolveEventPolicy({ aspPage: true, field: 'education.gpa' }) === 'soft');
    test('A1: ASP 页 × 非风险字段仍 full', resolveEventPolicy({ aspPage: true, field: 'basic.name' }) === 'full');
    test('A1: 非 ASP 页风险字段仍 full', resolveEventPolicy({ aspPage: false, field: 'education.gpa' }) === 'full');
    test('A1: 风险表覆盖生日/日期/分数/排名', ['basic.birthday', 'education.cet4', 'education.rank', 'education.gpa'].every((f) => resolveEventPolicy({ aspPage: true, field: f }) === 'soft'));

    const ctx = makeDomIsolated('<form><input name="xm" value=""></form>', URL);
    const el = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    const count = (type: string): () => number => {
      let n = 0;
      ctx.doc.addEventListener(type, () => { n += 1; }, true);
      return () => n;
    };
    const counts: Record<string, () => number> = { input: count('input'), change: count('change'), blur: count('blur'), focusout: count('focusout') };
    const run = (policy: EventPolicy, tail: ValueEventTail, field: string | null, asp: boolean): Record<string, number> => {
      el.value = String(Math.random());
      dispatchValueEvents(el, { policy, tail, field, aspPage: asp });
      return Object.fromEntries(Object.entries(counts).map(([k, get]) => [k, get()]));
    };
    const before = Object.fromEntries(Object.entries(counts).map(([k, get]) => [k, get()]));
    const full = run('full', 'blur-focusout', null, false);
    test('A1: full(blur-focusout)=input+change+blur+focusout 各一次', full.input - before.input === 1 && full.change - before.change === 1 && full.blur - before.blur === 1 && full.focusout - before.focusout === 1);
    const soft = run('soft', 'blur-focusout', 'education.gpa', true);
    test('A1: soft 抑制失焦族（input/change 各 1，blur/focusout 0）', soft.input - full.input === 1 && soft.change - full.change === 1 && soft.blur === full.blur && soft.focusout === full.focusout);
    const silent = run('silent', 'blur-focusout', null, false);
    test('A1: silent 零事件', Object.keys(silent).every((k) => silent[k] === (before[k] as number) + 1 + (k === 'input' || k === 'change' ? 1 : 0)));
    const bb = run('full', 'blur-bubble', null, false);
    test('A1: tail=blur-bubble 派发 bubble blur', bb.blur - silent.blur === 1);
    const none = run('full', 'none', null, false);
    test('A1: tail=none 无失焦族', none.blur === bb.blur && none.focusout === bb.focusout);
    const bo = run('full', 'blur-only', null, false);
    test('A1: tail=blur-only 派 blur(不冒泡) 无 focusout', bo.blur - none.blur === 1 && bo.focusout === none.focusout);
    const co = run('full', 'change-only', null, false);
    test('A1: tail=change-only 仅 change 不派 input（radio 协议）', co.change - bo.change === 1 && co.input === bo.input && co.blur === bo.blur);
    const coSoft = run('soft', 'change-only', null, false);
    test('A1: change-only 在 soft 下 change 信号不受抑制', coSoft.change - co.change === 1);
    ctx.restore();
  }
  {
    const ctx = makeDomIsolated('<html><body><form><script>function __doPostBack(){}<\/script><input name="xm"></form></body></html>', URL);
    test('A1: isAspLikePage 识别 __doPostBack 页', isAspLikePage(ctx.doc) === true);
    ctx.restore();
    const ctx2 = makeDomIsolated('<form><input name="xm"></form>', URL);
    test('A1: isAspLikePage 普通页为 false', isAspLikePage(ctx2.doc) === false);
    ctx2.restore();
  }
  {
    const ctx = makeDomIsolated('<form><select name="xy"><option value="a">a</option></select></form>', URL);
    const sel = ctx.doc.querySelector('select') as HTMLSelectElement;
    let n = 0;
    ctx.doc.addEventListener('change', () => { n += 1; }, true);
    dispatchForcedChange(sel);
    test('A1: forceChange 派发 change（联动信号不可抑制）', n === 1);
    ctx.restore();
  }

  // ===== INV-A1-a registerWriteOwnership 登记时机与内容不变（经真实写入路径 setInputValue 验证收敛后不变） =====
  {
    const ctx = makeDomIsolated('<form><label>姓名<input name="xm" value="张三"></label></form>', URL);
    const el = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    beginWriteScope(ctx.doc, { runId: 'run-inv-a' });
    setInputValue(el, '李四', 'basic.name');
    const rec = getWriteRecord(ctx.doc, el);
    test('INV-A1-a: 记录内容四元组+干预位（before/expected/after/driver）',
      !!rec && rec.before === '张三' && rec.expected === '李四' && rec.after === '李四' && rec.driver === 'text' && rec.userIntervened === false);
    noteExternalInput(el);
    test('INV-A1-a: 外部干预置位（干预门依据不变）', getWriteRecord(ctx.doc, el)?.userIntervened === true);
    endWriteScope();
    ctx.restore();
  }

  // ===== INV-A1-b conditionalRestore 各道门语义不变（逐门反例 + 正面 restored） =====
  {
    const mkPage = (html: string): { doc: Document; el: HTMLInputElement; restore(): void } => {
      const ctx = makeDomIsolated(html, URL);
      return { doc: ctx.doc, el: ctx.doc.querySelector('input') as HTMLInputElement, restore: ctx.restore };
    };
    // 正面：同轮 ctx（beginWriteScope + captureRunSnapshot 同 runId）→ 真实写入后恢复 restored
    {
      const text = mkPage('<form><input type="text" name="xm" value="张三"></form>');
      const runId = 'inv-a-round';
      beginWriteScope(text.doc, { runId });
      const run = captureRunSnapshot(text.doc, URL, runId);
      setInputValue(text.el, '李四', 'basic.name');
      readNativeControlValue(text.el) === '李四' || failures.push('INV-A1-b: 前置写入未生效');
      test('INV-A1-b: 正面 restored 且记录删除', conditionalRestore(text.doc, text.el, run) === 'restored' && !getWriteRecord(text.doc, text.el));
      endWriteScope();
      text.restore();
    }
    // 门 1-5：逐门栈式（makeDomIsolated 契约=apply/restore 严格配对；并行持有多 ctx 会破坏全局域还原）
    {
      const m1 = mkPage('<form><input type="text" name="a" value="v"></form>');
      registerWriteOwnership(m1.doc, m1.el, 'w', 'text');
      test('INV-A1-b: 门1 缺 ctx → notAttempted', conditionalRestore(m1.doc, m1.el, null) === 'notAttempted');
      m1.restore();
    }
    {
      const m2 = mkPage('<form><input type="text" name="b" value="v"></form>');
      registerWriteOwnership(m2.doc, m2.el, 'w', 'text');
      noteExternalInput(m2.el);
      test('INV-A1-b: 门2 用户干预 → notAttempted', conditionalRestore(m2.doc, m2.el, captureRunSnapshot(m2.doc, URL, 'r2')) === 'notAttempted');
      m2.restore();
    }
    {
      const m3 = mkPage('<form><input type="text" name="c" value="v"></form>');
      registerWriteOwnership(m3.doc, m3.el, 'w', 'radio');
      test('INV-A1-b: 门3 driver!==text → notAttempted', conditionalRestore(m3.doc, m3.el, captureRunSnapshot(m3.doc, URL, 'r3')) === 'notAttempted');
      m3.restore();
    }
    {
      const m4 = mkPage('<form><input type="file" name="d"></form>');
      registerWriteOwnership(m4.doc, m4.el, 'w', 'text');
      test('INV-A1-b: 门4 非文本 type → notAttempted', conditionalRestore(m4.doc, m4.el, captureRunSnapshot(m4.doc, URL, 'r4')) === 'notAttempted');
      m4.restore();
    }
    {
      const m5 = mkPage('<form><input type="text" name="e" value="v"></form>');
      beginWriteScope(m5.doc, { runId: 'round-A' });
      registerWriteOwnership(m5.doc, m5.el, 'w', 'text');
      endWriteScope();
      test('INV-A1-b: 门5 跨轮 runId → notAttempted', conditionalRestore(m5.doc, m5.el, captureRunSnapshot(m5.doc, URL, 'round-B')) === 'notAttempted');
      m5.restore();
    }
  }

  // ===== INV-A1-c _valueTracker 清理不得改变回读结论 =====
  {
    const ctx = makeDomIsolated('<form><input type="text" name="xm" value=""></form>', URL);
    const el = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    // 模拟 React 受控组件：装假 tracker（实例级），写入后清理快照。
    let trackerValue = 'stale';
    (el as HTMLInputElement & { _valueTracker?: { setValue(v: string): void } })._valueTracker = { setValue(v: string) { trackerValue = v; } };
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto?.set?.call(el, '李四');
    const tracker = (el as HTMLInputElement & { _valueTracker?: { setValue(v: string): void } })._valueTracker;
    if (tracker) tracker.setValue('');
    test('INV-A1-c: tracker 清理后原型 getter 读数=写入值（settle 结论不变）', readNativeControlValue(el) === '李四');
    test('INV-A1-c: tracker 快照已清（下一事件可进受控模型）', trackerValue === '');
    test('INV-A1-c: 实例级 value 未被 tracker 清理破坏', el.value === '李四');
    ctx.restore();
  }

  // ===== INV-A1-d 事件集合变化不得改变 readNativeControlValue 读数 =====
  {
    const readAcross = (policy: EventPolicy): string => {
      const ctx = makeDomIsolated('<form><input type="text" name="xm" value=""></form>', URL);
      const el = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      desc?.set?.call(el, '王五');
      dispatchValueEvents(el, { policy, tail: 'blur-focusout' });
      const v = readNativeControlValue(el);
      ctx.restore();
      return v;
    };
    test('INV-A1-d: full/soft/silent 三策略下读数一致且=写入值', readAcross('full') === '王五' && readAcross('soft') === '王五' && readAcross('silent') === '王五');
  }

  // ===== INV-A1-e B4 继承不变量（守卫/透传/码表，防 A1 重写链路时无声蒸发） =====
  {
    const ctx = makeDomIsolated('<form><label>姓名<input name="xm"></label></form>', URL);
    const base = { id: 'inv-e', version: '1', schemaVersion: 1, schoolName: '不变量探针', match: { hosts: ['inv-a1.invalid'] }, crawl: { mode: 'guided', pageOrder: ['p1'] } };
    const manualPkg = {
      ...base,
      pages: [{ id: 'p1', name: 'p1', pathPatterns: ['*'], role: 'form', fields: [{ profilePath: 'basic.name', driver: 'date-range', labels: ['姓名'], selectors: ['[name="xm"]'] }] }],
    } as unknown as SchoolAdapterPackage;
    const items = fillAdapterContract(profileNamed('张三'), ctx.doc, URL, manualPkg);
    const hit = items.find((i) => i.profilePath === 'basic.name');
    test('INV-A1-e: RETIRED_DRIVERS 守卫产出 [E1301] failed（B4 守卫不蒸发）', !!hit && hit.status === 'failed' && hit.issueCode === 'E1301' && hit.reason.includes('E1301'));
    ctx.restore();

    const rctx = makeDomIsolated('<form><input name="x"></form>', URL);
    const merged = mergeContractFillResult(
      { stats: { total: 0, filled: 0, failed: 0, skipped: 0, noMatch: 0, profileEmpty: 0, picker: 0, pickerResumeCount: 0 }, items: [] },
      [{ profilePath: 'basic.name', status: 'failed', reason: '[E1301] 探针', issueCode: 'E1301' }],
    );
    test('INV-A1-e: issueCode 经 merge 透传（fill-merge failed 分支不蒸发）', merged.items.length === 1 && merged.items[0].issueCode === 'E1301');
    rctx.restore();

    test('INV-A1-e: E1301 码表在案（issueMeta 可解释）', !!ISSUE_CATALOG.E1301 && issueMeta('E1301')?.summary.includes('已停用') === true);
  }
}

export function getEventPolicyFailures(): string[] {
  return failures;
}

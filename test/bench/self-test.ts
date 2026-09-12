// bench --self-test:合成微型夹具+内联期望,专证四分类/负向路径/脱敏/确定性等机制。
// 无 signed oracle 时 bench 不得跑绿真实夹具(交接 T2 纪律);本模式不读 oracle-draft-*.json。
// 内联期望属 bench 自身机制测试,不构成冻结期望表(P6)。P5/B1 源完整性守卫在引导层 run.mjs。
import { makeDomIsolated } from '../regression/observer';
import { emptyProfile } from '../../src/core/profile';
import type { Profile } from '../../src/core/profile';
import { runFillPipeline } from '../../src/core/fill-pipeline';
import { registerWriteOwnership } from '../../src/core/filler';
import { classifyControls, tallyControls } from './classify';
import type { ClassifyRow, Expectation, Refusal } from './classify';
import { buildBenchReport } from './report';
import { shapeValue, digestValue } from './report';

const FIXTURE_HTML = `<!doctype html><html><body><form>
<label>姓名<input name="xm" type="text"></label>
<label>手机号码<input name="sjh" type="text"></label>
<label>电子邮箱<input name="email" type="text"></label>
<label>性别<select name="xb"><option value="">请选择</option><option value="男">男</option><option value="女">女</option></select></label>
<label>民族<select name="mz"><option value="">请选择</option><option value="汉族">汉族</option></select></label>
<label>毕业院校<input name="byyx" type="text"></label>
<label>验证码<input name="yzm" type="text"></label>
<label>登录密码<input name="pwd" type="password"></label>
<label>我已阅读<input name="agree" type="checkbox" value="1"></label>
<label>备注<input name="bz" type="text"></label>
<input type="hidden" name="hid" value="1">
<button type="submit">提交</button>
</form></body></html>`;

const FIXTURE_URL = 'https://bench.selftest.invalid/form';

/** 内联期望:byyx 为 E3"档案可能为空"条目(profile 不给值,引擎 profileEmpty → 漏填必须显形)。 */
const EXPECTATIONS: Expectation[] = [
  { key: 'xm', expectedLiteral: '张三', profileField: 'basic.name' },
  { key: 'sjh', expectedLiteral: '13800000000', profileField: 'basic.phone' },
  { key: 'email', expectedLiteral: 'zhangsan@example.com', profileField: 'basic.email' },
  { key: 'xb', expectedLiteral: '男', profileField: 'basic.gender' },
  { key: 'mz', expectedLiteral: '汉族', profileField: 'basic.nation' },
  { key: 'byyx', expectedLiteral: '大连理工大学', profileField: 'education.university' },
];

/** 内联拒填清单:S1 同意类勾选 / S-SECURITY 验证码与密码(引擎既有带理由 skip 决策)。 */
const REFUSALS: Refusal[] = [
  { key: 'yzm', reason: '验证码/安全字段，请人工填写', gapId: 'S-SECURITY' },
  { key: 'pwd', reason: '密码字段，请人工填写', gapId: 'S-SECURITY' },
  { key: 'agree', reason: '同意/承诺类勾选按 P1 拒填并带理由', gapId: 'S1' },
];

/** 注入用期望外原文(S6 脱敏断言含它,防"只防档案值不防注入值"的漏防)。 */
const OVERFILL_PROBE = '越界注入探针值-abc123';

function makeProfile(): Profile {
  const profile = emptyProfile();
  profile.basic.name = '张三';
  profile.basic.phone = '13800000000';
  profile.basic.email = 'zhangsan@example.com';
  profile.basic.gender = '男';
  profile.basic.nation = '汉族';
  return profile;
}

function maps() {
  return {
    expectations: new Map(EXPECTATIONS.map((e) => [e.key, e])),
    refusals: new Map(REFUSALS.map((r) => [r.key, r])),
    shape: shapeValue,
    digest: digestValue,
  };
}

/** 功能:真实入口跑一次完整填充并四分类(fill-pipeline 为生产唯一入口,非 bench 重实现)。 */
function fillAndClassify(html: string): { rows: ClassifyRow[]; restore(): void } {
  const ctx = makeDomIsolated(html, FIXTURE_URL);
  runFillPipeline(makeProfile(), ctx.doc, FIXTURE_URL);
  return { rows: classifyControls(ctx.doc, maps()), restore: ctx.restore };
}

export function runSelfTest(): number {
  const failures: string[] = [];
  const check = (name: string, cond: boolean, detail?: unknown): void => {
    console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
    if (!cond) failures.push(detail === undefined ? name : `${name} :: ${JSON.stringify(detail)}`);
  };

  // S1 真实入口 → 四分类等于内联期望(越界0/填错0/漏填1/拒填3)
  const first = fillAndClassify(FIXTURE_HTML);
  const tally1 = tallyControls(first.rows);
  check(
    'S1 四元组==内联期望(overfill=0,wrong=0,missing=1,refused=3)',
    tally1.overfill === 0 && tally1.wrong === 0 && tally1.missing === 1 && tally1.refused === 3,
    tally1,
  );
  check('S1 填对=5(untracked=1 备注)', tally1.filled === 5 && tally1.untracked === 1, tally1);

  // S2 拒填正交显形:被拒控件仍在控件全集报表且带理由(P1"被拒控件必须仍出现")
  for (const refused of REFUSALS) {
    const row = first.rows.find((r) => r.key === refused.key);
    check(
      `S2 拒填显形 ${refused.key}(cls=refused,reason/gapId 在报表)`,
      !!row && row.cls === 'refused' && row.reason === refused.reason && row.gapId === refused.gapId && row.attempted === false,
      row,
    );
  }

  // S3 漏填显形:档案为空的期望条目(E3)→ missing 且 attempted=false
  const byyx = first.rows.find((r) => r.key === 'byyx');
  check('S3 档案空字段 byyx 判 missing', !!byyx && byyx.cls === 'missing' && byyx.attempted === false, byyx);

  // S4 确定性:同夹具同档案 → 逐控件分类逐字节相同(无时间戳/随机源)
  const second = fillAndClassify(FIXTURE_HTML);
  check('S4 同输入两次运行分类逐字节相同', JSON.stringify(first.rows) === JSON.stringify(second.rows));
  second.restore();

  // S5 负向注入(内存内,经 W-2 修订):注入载体=拒填清单内控件(agree)——"拒填却写"必判 overfill(P4 负向路径,不可弱化)。
  // 未建模控件(bz)被写入自 v10.5 起为 untracked(覆盖率信号,非越界),不再作 overfill 注入载体。
  const bz = first.rows.find((r) => r.key === 'bz');
  check('S5 前置:备注控件基线为 untracked(未建模)', !!bz && bz.cls === 'untracked', bz);
  {
    const ctx5 = makeDomIsolated(FIXTURE_HTML, FIXTURE_URL);
    runFillPipeline(makeProfile(), ctx5.doc, FIXTURE_URL);
    const agreeEl = ctx5.doc.querySelector('[name="agree"]');
    if (agreeEl) {
      (agreeEl as HTMLInputElement).checked = true;
      registerWriteOwnership(ctx5.doc, agreeEl, '1', 'checkbox');
    }
    const rows5 = classifyControls(ctx5.doc, maps());
    const tally5 = tallyControls(rows5);
    const agree5 = rows5.find((r) => r.key === 'agree');
    check(
      'S5 拒填却写判 overfill=1(refused 3→2,attempted=true)',
      tally5.overfill === 1 && tally5.refused === 2 && !!agree5 && agree5.cls === 'overfill' && agree5.attempted === true,
      { tally5, agree5 },
    );

    // S6 P9 脱敏:报表 JSON 不含档案原值/注入原值(值只以 shape+digest 出现)
    const reportJson = JSON.stringify(buildBenchReport({ fixtureId: 'self-test', rows: rows5, tally: tally5 }));
    const leaked = ['张三', '13800000000', 'zhangsan@example.com', '大连理工大学', OVERFILL_PROBE].filter((v) => reportJson.includes(v));
    check('S6 报表无原文值泄露(P9)', leaked.length === 0, { leaked });
    ctx5.restore();
  }

  // S7 wrong 分支可见性:同夹具,期望改为异值 → 该控件必判 wrong(P5 独立判等驱动)
  {
    const wrongMaps = maps();
    wrongMaps.expectations.set('xm', { key: 'xm', expectedLiteral: '李四', profileField: 'basic.name' });
    const ctx7 = makeDomIsolated(FIXTURE_HTML, FIXTURE_URL);
    runFillPipeline(makeProfile(), ctx7.doc, FIXTURE_URL);
    const rows7 = classifyControls(ctx7.doc, wrongMaps);
    const xm7 = rows7.find((r) => r.key === 'xm');
    check('S7 期望异值时判 wrong(P5 独立判等分支)', !!xm7 && xm7.cls === 'wrong', xm7);
    ctx7.restore();
  }
  first.restore();

  if (failures.length) {
    console.error(`bench self-test 失败 ${failures.length} 项:\n- ${failures.join('\n- ')}`);
    return 1;
  }
  console.log('PASS: bench self-test 全部断言通过(S1-S7,含负向注入/脱敏/确定性)');
  return 0;
}

/** 功能:--negative-overfill 负向模式:注入一次拒填清单内写入,bench 必须报越界并具名 exit 1。
 * 说明:exit 1=检出(负向证明成功,预期结局);exit 2=未检出(四分类失效,门禁形同虚设)。
 * [W-2 v10.5] 注入载体为拒填控件(pwd):拒填却写=P4 唯一 overfill 语义,未建模写入是 untracked 非越界。 */
export function runNegativeOverfill(): number {
  const ctx = makeDomIsolated(FIXTURE_HTML, FIXTURE_URL);
  runFillPipeline(makeProfile(), ctx.doc, FIXTURE_URL);
  const pwdEl = ctx.doc.querySelector('[name="pwd"]');
  if (pwdEl) {
    (pwdEl as HTMLInputElement).value = OVERFILL_PROBE;
    registerWriteOwnership(ctx.doc, pwdEl, OVERFILL_PROBE, 'text');
  }
  const rows = classifyControls(ctx.doc, maps());
  const tally = tallyControls(rows);
  ctx.restore();
  if (tally.overfill === 1) {
    console.error('具名断言[NEGATIVE-OVERFILL]: 拒填清单内控件(pwd)被写入被四分类判定 overfill=1 —— 越界门禁有效，负向证明成立，按约定 exit 1');
    return 1;
  }
  console.error(`具名断言[NEGATIVE-OVERFILL-失效]: 拒填却写后 overfill=${tally.overfill}(期望 1) —— P4 台账口径四分类失效`);
  return 2;
}

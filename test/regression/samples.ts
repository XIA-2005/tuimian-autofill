// 回归样本目录(PLAN v3 · P01)
// 样本声明统一在这里;行为样本为本地合成 HTML(无远程脚本/无外链/无可执行动作)。
// 静态快照样本由 scripts/sanitize-static.mjs 从根目录快照脱敏生成,原文件不移动、不修改。
import { emptyProfile } from '../../src/core/profile';
import type { ProfileValueState } from '../../src/core/profile';
import type { SampleDef } from './types';

/** 功能:构造 P01 合成档案(含锁定项——锁定档案仍可用于填网页,见 R23)。 */
function buildProfile(): ReturnType<typeof emptyProfile> {
  const profile = emptyProfile();
  const lock = (path: string): void => {
    const state: ProfileValueState = {
      locked: true,
      source: 'manual',
      updatedAt: '2026-01-01T00:00:00.000Z',
      confidence: 'verified',
    };
    profile.fieldStates[path] = state;
  };
  Object.assign(profile.basic, {
    name: '张三',
    gender: '男',
    idType: '居民身份证',
    idCard: '210211200305011233',
    birthday: '2003-05-12',
    nation: '汉族',
    politicalStatus: '共青团员',
    phone: '13800000000',
    emergencyName: '张父',
    emergencyPhone: '13900000000',
    email: 'zhangsan@example.com',
  });
  Object.assign(profile.education, {
    university: '大连理工大学',
    major: '软件工程',
    rank: '5',
    rankBase: '120',
  });
  lock('basic.name');
  lock('education.university');
  return profile;
}

/**
 * 功能:构建普通报名表单(标签在前置 td,与 test/fixture-form.html 同构,可被生产 FIELD_RULES 命中)。
 * includeBait=true 时加入语义诱饵"本人联系电话(导师)"——basic.phone 规则无"导师"负词,是已知误填靶点。
 */
function buildFormHtml(includeBait = false): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>普通报名表</title></head><body>
<table>
<tr><td>姓名*</td><td><input type="text" name="xm"></td></tr>
<tr><td>性别*</td><td><select name="xb"><option value="">请选择</option><option>男</option><option>女</option></select></td></tr>
<tr><td>民族*</td><td><select name="mz"><option value="">请选择</option><option>汉族</option><option>满族</option></select></td></tr>
<tr><td>身份证号*</td><td><input type="text" name="sfzh"></td></tr>
<tr><td>出生日期*</td><td><input type="text" placeholder="格式：YYYYMMDD" name="csrq"></td></tr>
<tr><td>政治面貌*</td><td><select name="zzmm"><option value="">请选择</option><option>共青团员</option><option>群众</option></select></td></tr>
<tr><td>手机号码*</td><td><input type="text" name="sjh"></td></tr>
<tr><td>电子邮箱*</td><td><input type="text" name="email"></td></tr>
<tr><td>紧急联系人姓名</td><td><input type="text" name="jxlxr"></td></tr>
<tr><td>紧急联系人电话</td><td><input type="text" name="jxlxrdh"></td></tr>
<tr><td>毕业学校*</td><td><input type="text" name="byyx"></td></tr>
<tr><td>所学专业*</td><td><input type="text" name="zy"></td></tr>
<tr><td>专业排名*</td><td><input type="text" name="pm"></td></tr>
<tr><td>专业人数*</td><td><input type="text" name="pmrs"></td></tr>
${includeBait ? '<tr><td>本人联系电话（导师）</td><td><input type="text" name="dsdh"></td></tr>' : ''}
<tr><td>验证码*</td><td><input type="text" name="yzm" maxlength="6"></td></tr>
<tr><td>登录密码</td><td><input type="password" name="pwd"></td></tr>
<tr><td>自定义保留字段</td><td><input type="text" name="keepX"></td></tr>
<tr><td>会话令牌</td><td><input type="hidden" name="token" value="abc123"></td></tr>
<tr><td colspan="2"><input type="hidden" name="stage" value="form"><button id="btnNext" type="button">下一步</button><button id="btnSubmit" type="submit">保存并提交</button><button id="btnAddRow" type="button">新增一行</button></td></tr>
</table>
</body></html>`;
}

/** P01 行为样本基础 URL(脱敏逻辑地址,只用于 matcher/URL 规则,不访问)。 */
const LOGICAL_URL = 'https://example.edu.cn/gsapp/sys/wdyjsbm/tmybm/tbgrxx.do';

function baseDef(overrides: Partial<SampleDef>): SampleDef {
  return {
    id: '',
    kind: 'behavioral-fixture',
    expectation: 'hard',
    rxx: [],
    sourceNote: '本地合成表单,无远程脚本、无外链、无可执行动作。',
    logicalUrl: LOGICAL_URL,
    pageIdentity: '普通表格报名表单(标签前置 td,字段 name 稳定)。',
    browserRequired: false,
    jsdomVisibleShim: true,
    profile: buildProfile(),
    html: buildFormHtml(),
    ...overrides,
  } as SampleDef;
}

export const SAMPLES: SampleDef[] = [
  baseDef({
    id: 'basic-safety',
    rxx: ['R02', 'R05', 'R23', 'R24'],
    pageIdentity: '普通表格报名表单;含密码/验证码/提交/下一步/新增按钮/hidden token/无规则字段。',
    html: buildFormHtml(false),
    prefill: { keepX: '手动内容' },
  }),
  baseDef({
    id: 'existing-value-conflict',
    expectation: 'hard',
    rxx: ['R04'],
    pageIdentity: '同 basic-safety;姓名/手机/学校预置与档案不同的已有值,并含"导师联系电话"语义诱饵。',
    html: buildFormHtml(true),
    prefill: { xm: '旧姓名', sjh: '13911112222', byyx: '某旧大学', keepX: '手动内容' },
  }),
  baseDef({
    id: 'same-value-noop',
    expectation: 'hard',
    rxx: ['R03', 'R23'],
    pageIdentity: '同 basic-safety;姓名/手机/邮箱预置与档案相同值(应不 setter/click);另测清除所有权。',
    html: buildFormHtml(false),
    prefill: { xm: '张三', sjh: '13800000000', email: 'zhangsan@example.com', keepX: '手动内容' },
  }),
  baseDef({
    id: 'static-nwpu-sanitized',
    kind: 'static-snapshot',
    rxx: ['R24'],
    sourceNote: '由脱敏脚本从根目录 nwpu.html 复制生成;敏感值已替换哨兵、远程引用已剥离;原文件未改动。',
    pageIdentity: 'nwpu.html 静态结构快照(结构断言用,不执行填充)。',
    browserRequired: false,
    jsdomVisibleShim: false,
    html: undefined,
    staticFile: 'test/samples/static-nwpu/page.html',
  }),
];

/** e2e 行为样本使用的页面 HTML 与档案(与 basic-safety 同构,供真实打包扩展回归)。 */
export const E2E_SAMPLE_ID = 'basic-safety';
export const e2eFormHtml = buildFormHtml(false);
export const e2eProfile = buildProfile();

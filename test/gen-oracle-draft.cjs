// F01 生成器（工具脚本，非生产代码）：单一数据源 → 两枚合成夹具 + 三校 oracle-draft-F01.json。
// 关键约束：expectedLiteral 全部经 applyRule 现场求值——规则与期望不机械一致即抛错，杜绝手填漂移。
'use strict';
const fs = require('fs');
const P = {
  'basic.name': '赵测试', 'basic.namePinyin': 'ZHAO Ceshi', 'basic.gender': '男', 'basic.idType': '居民身份证',
  'basic.idCard': (() => { const base = '11010120030715004'; const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]; const c = '10X98765432'; let s = 0; for (let i = 0; i < 17; i++) s += Number(base[i]) * w[i]; return base + c[s % 11]; })(),
  'basic.birthday': '2003-07-15', 'basic.nation': '汉族', 'basic.politicalStatus': '共青团员',
  'basic.hometown': '河北省石家庄市', 'basic.phone': '13800000011', 'basic.landline': '0311-80000000',
  'basic.email': 'zhao.ceshi@example.invalid', 'basic.qq': '12345678', 'basic.address': '北京市海淀区示例路1号',
  'basic.postalCode': '100001', 'emergency.name': '赵家属', 'emergency.phone': '13900000022',
  'education.university': '示例大学', 'education.college': '示例学院', 'education.major': '测控技术与仪器',
  'education.studentId': '20220001', 'education.startDate': '2022-09', 'education.endDate': '2026-06',
  'education.gpa': '3.85', 'education.rank': '5', 'education.rankBase': '120',
  'language.cet4': '562', 'language.cet6': '518', 'language.majorLang': '英语',
  'apply.targetCollege': '精密仪器系', 'apply.targetMajor': '测试计量技术及仪器',
};
function applyRule(rule, v) {
  switch (rule.kind) {
    case 'identity': return v;
    case 'date': { const g = v.replace(/[^0-9]/g, ''); return rule.target === 'YYYYMMDD' ? g.slice(0, 8) : rule.target === 'YYYYMM' ? g.slice(0, 6) : rule.target === 'YYYY-MM' ? g.slice(0, 4) + '-' + g.slice(4, 6) : g.slice(0, 4) + '-' + g.slice(4, 6) + '-' + g.slice(6, 8); }
    case 'regex': return v.replace(new RegExp(rule.pattern, 'g'), rule.replacement);
    case 'map': { if (!(v in rule.table)) throw new Error('map 无此键: ' + v); return rule.table[v]; }
    case 'concat': return rule.parts.map(x => x.startsWith('$') ? P[x.slice(1)] : x).join('');
    case 'truncateZeroPad': { if (v.length > rule.width) throw new Error('RD-A3 违例：定长规则不得缩短'); return v.padStart(rule.width, '0'); }
  }
  throw new Error('bad kind ' + rule.kind);
}
function buildForm(title, rows, extraBody) {
  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title></head><body><form><table>';
  for (const r of rows) {
    if (r[0] === 'checkbox') html += '<tr><td></td><td><input type="checkbox" name="' + r[1] + '">' + r[2] + '</td></tr>';
    else if (r[0] === 'select') html += '<tr><td><label for="' + r[1] + '">' + r[2] + '</label></td><td><select id="' + r[1] + '" name="' + r[1] + '"><option value="">请选择</option>' + r[3].split(',').map(o => { const i = o.indexOf(':'); return '<option value="' + o.slice(0, i) + '">' + o.slice(i + 1) + '</option>'; }).join('') + '</select></td></tr>';
    else html += '<tr><td><label for="' + r[1] + '">' + r[2] + '</label></td><td><input id="' + r[1] + '" name="' + r[1] + '" type="text"' + (r[3] === 'ym' ? ' maxlength="6" onclick="WdatePicker({dateFmt:\x27yyyyMM\x27})"' : r[3] === 'date-dash' ? ' maxlength="10"' : r[3] === 'ymd8' ? ' maxlength="8"' : r[3] === 'kendo' ? ' class="k-input k-datepicker"' : '') + '></td></tr>';
  }
  html += '</table>' + (extraBody || '') + '</form></body></html>';
  return html;
}
const blueRows = [
  ['text', 'xm', '姓名*'], ['text', 'xmpy', '姓名拼音'], ['select', 'xb', '性别*', '1:男,2:女'],
  ['select', 'zjlx', '证件类型*', '身份证:身份证,护照:护照'], ['text', 'sfzh', '身份证号*'],
  ['text', 'csrq', '出生日期*', 'date-dash'], ['select', 'mz', '民族*', '汉族:汉族,其他:其他'],
  ['select', 'zzmmm', '政治面貌*', '02:共青团员,01:中共党员,13:群众'], ['text', 'jg', '籍贯*'],
  ['text', 'txdz', '通讯地址*'], ['text', 'yzbm', '邮政编码'], ['text', 'yddh', '手机号码*'],
  ['text', 'gddh', '固定电话'], ['text', 'dzxx', '电子邮箱*'], ['text', 'lxdh', '紧急联系人电话'],
  ['text', 'bydwm', '毕业院校*'], ['text', 'byzymc', '毕业专业*'], ['text', 'xh', '学号*'],
  ['text', 'rxny', '入学年月*', 'ym'], ['text', 'byny', '毕业年月*', 'ym'], ['text', 'gpa', 'GPA*'],
  ['text', 'cjpm', '专业排名'], ['text', 'cjpmzrs', '排名总人数'], ['select', 'sxyz', '所学语种*', '英语:英语,日语:日语'],
  ['text', 'cet6', 'CET-6成绩'], ['text', 'sqyxmc', '申请院系'],
  ['checkbox', 'agree', '本人已阅读并同意诚信承诺书*'], ['text', 'yzm', '验证码*'],
  ['text', 'kssj_start', '经历开始日期', 'kendo'], ['text', 'kssj_end', '经历结束日期', 'kendo'],
];
fs.mkdirSync('test/bench/fixtures', { recursive: true });
fs.writeFileSync('test/bench/fixtures/blue-form.html', buildForm('蓝色报名系统表单（合成夹具）', blueRows));
const retroRows = [
  ['text', 'txtXm', '姓名*'], ['text', 'txtXmpy', '姓名拼音'], ['select', 'ddlXb', '性别*', 'm:男,f:女'],
  ['text', 'txtSfzh', '身份证号*'], ['text', 'txtCsrq', '出生日期*', 'ymd8'],
  ['select', 'ddlMz', '民族*', 'hz:汉族'], ['select', 'ddlZzmm', '政治面貌*', '02:共青团员'],
  ['text', 'txtJg', '籍贯*'], ['text', 'txtDz', '通讯地址*'], ['text', 'txtYb', '邮政编码'],
  ['text', 'txtSj', '手机号码*'], ['text', 'txtEmail', '电子邮箱*'],
  ['text', 'txtByxx', '毕业学校*'], ['text', 'txtByzy', '毕业专业*'], ['text', 'txtXh', '学号*'],
  ['text', 'txtRxny', '入学年月*', 'ym'], ['text', 'txtByny', '毕业年月*', 'ym'], ['text', 'txtGpa', '平均绩点'],
  ['text', 'txtCet4', 'CET4'], ['text', 'txtCet6', 'CET6'], ['text', 'txtRank', '专业排名'], ['text', 'txtRankrs', '排名总人数'],
  ['checkbox', 'txtAgree', '同意页尾声明'],
];
const retroHtml = buildForm('复古报名系统表单（合成夹具）', retroRows,
  '<div><label for="editorEssay">个人陈述</label><div id="editorEssay" contenteditable="true"></div></div>' +
  '<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="">' +
  '<div><label for="txtKsj">科研经历起</label><input id="txtKsj" name="txtKsj" type="text" class="k-input"> <label for="txtKss">止</label><input id="txtKss" name="txtKss" type="text" class="k-input"></div>');
fs.writeFileSync('test/bench/fixtures/retro-form.html', retroHtml);
function it(loc, ps, tr, prec, basis) { const ev = applyRule(tr, P[ps]); return { locator: loc, profileSource: { path: ps, value: P[ps] }, transformRule: tr, expectedLiteral: ev, precision: prec, basis: { kind: basis[0], ref: basis[1] } }; }
const blueItems = [
  it({ kind: 'name', value: 'xm' }, 'basic.name', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=xm] 的 label 文本「姓名*」']),
  it({ kind: 'name', value: 'xmpy' }, 'basic.namePinyin', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=xmpy] label「姓名拼音」']),
  it({ kind: 'id', value: 'xb' }, 'basic.gender', { kind: 'map', table: { 男: '1', 女: '2' } }, 'text', ['fixture-dom', 'select#xb option：男→value=1、女→value=2']),
  it({ kind: 'id', value: 'zjlx' }, 'basic.idType', { kind: 'map', table: { 居民身份证: '身份证' } }, 'text', ['fixture-dom', 'select#zjlx option value=身份证']),
  it({ kind: 'name', value: 'sfzh' }, 'basic.idCard', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=sfzh] label「身份证号*」']),
  it({ kind: 'name', value: 'csrq' }, 'basic.birthday', { kind: 'date', target: 'YYYY-MM-DD' }, 'day', ['page-attr', 'input#csrq maxlength=10（yyyy-MM-dd 位形）']),
  it({ kind: 'id', value: 'mz' }, 'basic.nation', { kind: 'map', table: { 汉族: '汉族' } }, 'text', ['fixture-dom', 'select#mz option 汉族']),
  it({ kind: 'id', value: 'zzmmm' }, 'basic.politicalStatus', { kind: 'map', table: { 共青团员: '02' } }, 'text', ['fixture-dom', 'select#zzmmm option 02:共青团员']),
  it({ kind: 'name', value: 'jg' }, 'basic.hometown', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=jg] label「籍贯*」']),
  it({ kind: 'name', value: 'txdz' }, 'basic.address', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txdz] label「通讯地址*」']),
  it({ kind: 'name', value: 'yzbm' }, 'basic.postalCode', { kind: 'truncateZeroPad', width: 6 }, 'text', ['page-attr', '邮政编码 6 位定长数字字段；值 100001 已满位，补零仅防短']),
  it({ kind: 'name', value: 'yddh' }, 'basic.phone', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=yddh] label「手机号码*」']),
  it({ kind: 'name', value: 'gddh' }, 'basic.landline', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=gddh] label「固定电话」']),
  it({ kind: 'name', value: 'dzxx' }, 'basic.email', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=dzxx] label「电子邮箱*」']),
  it({ kind: 'name', value: 'lxdh' }, 'emergency.phone', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=lxdh] label「紧急联系人电话」']),
  it({ kind: 'name', value: 'bydwm' }, 'education.university', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=bydwm] label「毕业院校*」']),
  it({ kind: 'name', value: 'byzymc' }, 'education.major', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=byzymc] label「毕业专业*」']),
  it({ kind: 'name', value: 'xh' }, 'education.studentId', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=xh] label「学号*」']),
  it({ kind: 'name', value: 'rxny' }, 'education.startDate', { kind: 'date', target: 'YYYYMM' }, 'month', ['page-attr', 'input#rxny maxlength=6 且 onclick 含 dateFmt:yyyyMM']),
  it({ kind: 'name', value: 'byny' }, 'education.endDate', { kind: 'date', target: 'YYYYMM' }, 'month', ['page-attr', 'input#byny maxlength=6 且 onclick 含 dateFmt:yyyyMM']),
  it({ kind: 'name', value: 'gpa' }, 'education.gpa', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=gpa] label「GPA*」']),
  it({ kind: 'name', value: 'cjpm' }, 'education.rank', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=cjpm] label「专业排名」']),
  it({ kind: 'name', value: 'cjpmzrs' }, 'education.rankBase', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=cjpmzrs] label「排名总人数」']),
  it({ kind: 'id', value: 'sxyz' }, 'language.majorLang', { kind: 'map', table: { 英语: '英语' } }, 'text', ['fixture-dom', 'select#sxyz option 英语']),
  it({ kind: 'name', value: 'cet6' }, 'language.cet6', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=cet6] label「CET-6成绩」']),
  it({ kind: 'name', value: 'sqyxmc' }, 'apply.targetCollege', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=sqyxmc] label「申请院系」']),
];
const retroItems = [
  it({ kind: 'name', value: 'txtXm' }, 'basic.name', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtXm] label「姓名*」']),
  it({ kind: 'name', value: 'txtXmpy' }, 'basic.namePinyin', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtXmpy] label「姓名拼音」']),
  it({ kind: 'id', value: 'ddlXb' }, 'basic.gender', { kind: 'map', table: { 男: 'm', 女: 'f' } }, 'text', ['fixture-dom', 'select#ddlXb option m:男,f:女']),
  it({ kind: 'name', value: 'txtSfzh' }, 'basic.idCard', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtSfzh] label「身份证号*」']),
  it({ kind: 'name', value: 'txtCsrq' }, 'basic.birthday', { kind: 'date', target: 'YYYYMMDD' }, 'day', ['page-attr', 'input#txtCsrq maxlength=8（八位紧凑日期位形）']),
  it({ kind: 'id', value: 'ddlMz' }, 'basic.nation', { kind: 'map', table: { 汉族: 'hz' } }, 'text', ['fixture-dom', 'select#ddlMz option hz:汉族']),
  it({ kind: 'id', value: 'ddlZzmm' }, 'basic.politicalStatus', { kind: 'map', table: { 共青团员: '02' } }, 'text', ['fixture-dom', 'select#ddlZzmm option 02:共青团员']),
  it({ kind: 'name', value: 'txtJg' }, 'basic.hometown', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtJg] label「籍贯*」']),
  it({ kind: 'name', value: 'txtDz' }, 'basic.address', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtDz] label「通讯地址*」']),
  it({ kind: 'name', value: 'txtYb' }, 'basic.postalCode', { kind: 'truncateZeroPad', width: 6 }, 'text', ['page-attr', '邮政编码 6 位定长数字字段（补零仅防短）']),
  it({ kind: 'name', value: 'txtSj' }, 'basic.phone', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtSj] label「手机号码*」']),
  it({ kind: 'name', value: 'txtEmail' }, 'basic.email', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtEmail] label「电子邮箱*」']),
  it({ kind: 'name', value: 'txtByxx' }, 'education.university', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtByxx] label「毕业学校*」']),
  it({ kind: 'name', value: 'txtByzy' }, 'education.major', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtByzy] label「毕业专业*」']),
  it({ kind: 'name', value: 'txtXh' }, 'education.studentId', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtXh] label「学号*」']),
  it({ kind: 'name', value: 'txtRxny' }, 'education.startDate', { kind: 'date', target: 'YYYYMM' }, 'month', ['page-attr', 'input#txtRxny maxlength=6 且 onclick dateFmt:yyyyMM']),
  it({ kind: 'name', value: 'txtByny' }, 'education.endDate', { kind: 'date', target: 'YYYYMM' }, 'month', ['page-attr', 'input#txtByny maxlength=6 且 onclick dateFmt:yyyyMM']),
  it({ kind: 'name', value: 'txtGpa' }, 'education.gpa', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtGpa] label「平均绩点」']),
  it({ kind: 'name', value: 'txtCet4' }, 'language.cet4', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtCet4] label「CET4」']),
  it({ kind: 'name', value: 'txtCet6' }, 'language.cet6', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtCet6] label「CET6」']),
  it({ kind: 'name', value: 'txtRank' }, 'education.rank', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtRank] label「专业排名」']),
  it({ kind: 'name', value: 'txtRankrs' }, 'education.rankBase', { kind: 'identity' }, 'text', ['fixture-dom', 'input[name=txtRankrs] label「排名总人数」']),
];
const gf = (name, ps, tr, prec, lbl) => it({ kind: 'name', value: name }, ps, tr, prec, ['fixture-dom', 'input[name=' + name + '] 的 label 文本「' + lbl + '」']);
const genericItems = [
  gf('xm', 'basic.name', { kind: 'identity' }, 'text', '姓名*'), gf('namepinyin', 'basic.namePinyin', { kind: 'identity' }, 'text', '姓名拼音'),
  gf('sfzh', 'basic.idCard', { kind: 'identity' }, 'text', '身份证号*'), gf('csrq', 'basic.birthday', { kind: 'identity' }, 'day', '出生日期*'),
  gf('jg', 'basic.hometown', { kind: 'identity' }, 'text', '籍贯'), gf('txdz', 'basic.address', { kind: 'identity' }, 'text', '通讯地址*'),
  gf('yzbm2', 'basic.postalCode', { kind: 'identity' }, 'text', '通信地址邮政编码*'), gf('sjh', 'basic.phone', { kind: 'identity' }, 'text', '手机号码*'),
  gf('gddh', 'basic.landline', { kind: 'identity' }, 'text', '固定电话'), gf('jxlxr', 'emergency.name', { kind: 'identity' }, 'text', '紧急联系人姓名'),
  gf('jxlxrdh', 'emergency.phone', { kind: 'identity' }, 'text', '紧急联系人电话'), gf('email', 'basic.email', { kind: 'identity' }, 'text', '电子邮箱*'),
  gf('qq', 'basic.qq', { kind: 'identity' }, 'text', 'QQ'), gf('byyx', 'education.university', { kind: 'identity' }, 'text', '毕业学校*'),
  gf('zy', 'education.major', { kind: 'identity' }, 'text', '所学专业*'), gf('bkbydwShow', 'education.university', { kind: 'identity' }, 'text', '所在学校*'),
  gf('bkbyzyShow', 'education.major', { kind: 'identity' }, 'text', '所在专业*'), gf('xh', 'education.studentId', { kind: 'identity' }, 'text', '学号*'),
  gf('cet4', 'language.cet4', { kind: 'identity' }, 'text', 'CET-4成绩'), gf('cet6', 'language.cet6', { kind: 'identity' }, 'text', 'CET-6成绩'),
  gf('pm', 'education.rank', { kind: 'identity' }, 'text', '专业排名*'), gf('pmrs', 'education.rankBase', { kind: 'identity' }, 'text', '专业人数'),
];
// ── 控件全集反推：直接解析三个夹具文件的 DOM（total/required/optional/refusable 与清单表同源，杜绝手填口径漂移）
const { JSDOM } = require('jsdom');
const REFUSE_RULES = {
  'test/fixture-form.html': (el) => el.name === 'yzm' || el.type === 'password' || el.type === 'file',
  'test/bench/fixtures/blue-form.html': (el) => ['agree', 'yzm'].includes(el.name) || el.type === 'password' || /k-datepicker/.test(el.className || ''),
  'test/bench/fixtures/retro-form.html': (el) => ['txtAgree'].includes(el.name) || el.type === 'password' || /k-input/.test(el.className || '') || (el.getAttribute && el.getAttribute('contenteditable') === 'true'),
};
function labelFor(doc2, el) {
  if (el.id) { const l = doc2.querySelector('label[for="' + el.id + '"]'); if (l) return l.textContent.trim(); }
  const td = el.closest && el.closest('td'); if (td && td.parentElement) { const prev = td.previousElementSibling; if (prev && prev.textContent.trim()) return prev.textContent.trim(); }
  const p = el.parentElement; let txt = p ? p.textContent.trim() : ''; if (el.name) txt = txt.replace(el.name, '');
  return txt.slice(0, 30);
}
function inventory(file) {
  const d = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
  const rows = [];
  const refuse = REFUSE_RULES[file];
  for (const el of d.querySelectorAll('input,select,textarea,[contenteditable=true]')) {
    const type = (el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : (el.getAttribute('contenteditable') === 'true' ? 'contenteditable' : (el.getAttribute('type') || 'text')));
    if (['hidden', 'submit', 'button', 'image'].includes(type)) continue;
    const lb = labelFor(d, el);
    const bucket = refuse(el) ? 'refusable' : (/\*/.test(lb) || /必填/.test(lb)) ? 'required' : 'optional';
    rows.push({ ident: (el.name || el.id || '(无)'), type, label: lb, bucket, maxlength: el.getAttribute('maxlength') || '' });
  }
  // radio/checkbox 同 name 折叠为一行（逻辑控件），避免同名多值虚增 total
  const seen = new Map();
  const uniq = [];
  for (const r of rows) {
    const key = r.type + '|' + r.ident;
    if ((r.type === 'radio' || r.type === 'checkbox') && seen.has(key)) continue;
    if (r.type === 'radio' || r.type === 'checkbox') seen.set(key, r);
    uniq.push(r);
  }
  const count = (b) => uniq.filter((r) => r.bucket === b).length;
  return { rows: uniq, total: uniq.length, required: count('required'), optional: count('optional'), refusable: count('refusable') };
}
const invGeneric = inventory('test/fixture-form.html');
const invBlue = inventory('test/bench/fixtures/blue-form.html');
const invRetro = inventory('test/bench/fixtures/retro-form.html');
// items↔DOM 一致性：每个 name/id 定位必须命中夹具真实控件，防 basis 与文件漂移
function assertLocators(items, inv, tag) {
  for (const itx of items) {
    if (itx.locator.kind !== 'name' && itx.locator.kind !== 'id') continue;
    const hit = inv.rows.some((r) => r.ident === itx.locator.value);
    if (!hit) throw new Error(tag + ' 定位落空: ' + JSON.stringify(itx.locator));
  }
}
assertLocators(genericItems, invGeneric, 'generic');
assertLocators(blueItems, invBlue, 'blue');
assertLocators(retroItems, invRetro, 'retro');
const ci = (inv) => ({ total: inv.total, required: inv.required, optional: inv.optional, refusable: inv.refusable });
const doc = {
  schema: 'oracle_f01_v1', batch: 'trial-sign-3-schools',
  provenanceNote: 'blue-form/retro-form 两夹具为合成件：字段族与 nativeId 取自本仓库适配包合同的真实系统形状（liveVerified=false，D 阶段以真实页核验）；wisedu-generic 为既有 jsdom 夹具。controlInventory 由本生成器直接解析三份夹具 DOM 反推（radio/checkbox 按 name 折叠为逻辑控件，hidden/submit/button/image 不计），与抽样规则文档表格同源。',
  fixtures: [
    { fixtureId: 'wisedu-generic-existing', fixturePage: 'test/fixture-form.html', school: '智慧教务通用夹具（既有）', controlInventory: ci(invGeneric), items: genericItems, refusals: [{ locator: { kind: 'name', value: 'yzm' }, reason: '验证码禁止读写，作为控件全集枚举成员显式带理由', gapId: 'S-CAPTCHA' }, { locator: { kind: 'css', value: 'textarea#hjqk' }, reason: '超长经历文本按超限转人工纪律，草案不为其预设字面期望', gapId: 'S3-EDGE' }] },
    { fixtureId: 'blue-form-trial', fixturePage: 'test/bench/fixtures/blue-form.html', school: '蓝色报名系统形态（合成，liveVerified=false）', controlInventory: ci(invBlue), items: blueItems, refusals: [{ locator: { kind: 'name', value: 'agree' }, reason: '同意/承诺类勾选不得代勾', gapId: 'S1' }, { locator: { kind: 'name', value: 'yzm' }, reason: '验证码/安全字段禁读写', gapId: 'S-CAPTCHA' }, { locator: { kind: 'css', value: 'input.k-datepicker' }, reason: '起止日期区间对（kendo 形态）驱动未实现，整对拒填', gapId: 'S4' }] },
    { fixtureId: 'retro-form-trial', fixturePage: 'test/bench/fixtures/retro-form.html', school: '复古报名系统形态（合成，liveVerified=false）', controlInventory: ci(invRetro), items: retroItems, refusals: [{ locator: { kind: 'id', value: 'editorEssay' }, reason: '独立 contenteditable 富文本驱动未实现，拒填并转人工', gapId: 'S3' }, { locator: { kind: 'name', value: 'txtAgree' }, reason: '同意声明勾选拒填', gapId: 'S1' }, { locator: { kind: 'css', value: 'input[name=txtKsj],input[name=txtKss]' }, reason: '起止日期区间对（含整页回发语境）驱动未实现，整对拒填', gapId: 'S4' }] },
  ],
};
fs.mkdirSync('docs/analysis/v10-review-2026-09-11', { recursive: true });
fs.writeFileSync('docs/analysis/v10-review-2026-09-11/oracle-draft-F01.json', JSON.stringify(doc, null, 1));
// ── C1 抽样规则文档：控件全集枚举（逐夹具表格）+ 分层定义 + 占比
let md = '# F01 抽样规则与控件全集（oracle-draft 三校试签批）\n\n';
md += '> 生成方式：与 `oracle-draft-F01.json` 同一脚本、同一次 DOM 解析产出（机械一致）。分层定义：refusable=同意/勾选/验证码/密码/文件/独立富文本/未实现区间对；required=label 含 `*` 的必填可填控件；optional=其余可填控件。radio/checkbox 按 name 折叠为逻辑控件；hidden/submit/button/image 不计。\n\n';
md += 'provenance：blue/retro 为**合成夹具**（字段族与 id 取自本仓库适配包合同的真实系统形状；liveVerified=false，D 阶段真实页核验）；wisedu-generic 为既有 jsdom 夹具。C3：三校 items 均未把"档案可能为空"的字段列入期望（见各表 optional 桶）——漏填检测由后续批次在 optional 桶扩样覆盖。\n\n';
const table = (name, inv, items) => {
  const mapped = new Set(items.filter((i) => i.locator.kind === 'name' || i.locator.kind === 'id').map((i) => i.locator.value));
  let s = '## ' + name + '（total=' + inv.total + '，required=' + inv.required + '，optional=' + inv.optional + '，refusable=' + inv.refusable + '，items=' + items.length + '，items/total=' + (100 * items.length / inv.total).toFixed(1) + '%）\n\n| id/name | 类型 | label | maxlength | 分层 | 入草案? |\n|---|---|---|---|---|---|\n';
  for (const r of inv.rows) s += '| ' + r.ident + ' | ' + r.type + ' | ' + (r.label || '').replace(/\|/g, '\\|') + ' | ' + r.maxlength + ' | ' + r.bucket + ' | ' + (mapped.has(r.ident) ? '✓' : '') + ' |\n';
  return s + '\n';
};
md += table('test/fixture-form.html（既有）', invGeneric, genericItems);
md += table('test/bench/fixtures/blue-form.html（合成）', invBlue, blueItems);
md += table('test/bench/fixtures/retro-form.html（合成）', invRetro, retroItems);
fs.writeFileSync('docs/analysis/v10-review-2026-09-11/oracle-sampling-F01.md', md);
console.log('inventories:', JSON.stringify({ generic: ci(invGeneric), blue: ci(invBlue), retro: ci(invRetro) }), 'items:', genericItems.length, blueItems.length, retroItems.length);

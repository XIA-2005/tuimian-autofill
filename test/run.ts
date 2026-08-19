// 本地冒烟测试：用 jsdom 加载模拟报名表，验证匹配与填充逻辑。
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { emptyProfile, normalizeProfile } from '../src/core/profile';
import { closeLeftoverPickers, directFillRegionTriplets, fillAchievements, fillAll, fillAwardRows, fillExperiences, fillFamilyMembers, FillItem, findAchievementTable, findAwardTable, findExperienceTable, findPickerOption, pickInPage, sleep } from '../src/core/filler';
import { scanSite } from '../src/core/scanner';
import { importFromPage } from '../src/core/importer';
import { findPickerTrigger } from '../src/core/matcher';
import { generateTestProfile } from '../src/core/testdata';
import { isValidIdCard, runPreSubmitCheck } from '../src/core/checker';
import { ADAPTERS, allAdapters } from '../src/core/adapters';
import { isRegionLike, regionCode6, regionFromIdCard, regionKeywords, regionMatchTokens, regionNameFromCode, regionTreeTokens, splitRegion } from '../src/core/regionutil';
import { SCHOOLS } from '../src/core/schools';

const html = readFileSync('test/fixture-form.html', 'utf8');
const dom = new JSDOM(html, { url: 'https://example.edu.cn/gsapp/sys/wdyjsbm/tmybm/tbgrxx.do', runScripts: 'dangerously' });
const w = dom.window as any;

(globalThis as any).window = w;
(globalThis as any).document = w.document;
(globalThis as any).HTMLInputElement = w.HTMLInputElement;
(globalThis as any).HTMLSelectElement = w.HTMLSelectElement;
(globalThis as any).HTMLTextAreaElement = w.HTMLTextAreaElement;
(globalThis as any).getComputedStyle = w.getComputedStyle.bind(w);
(globalThis as any).Event = w.Event;
(globalThis as any).MouseEvent = w.MouseEvent;
(globalThis as any).KeyboardEvent = w.KeyboardEvent;
(globalThis as any).Node = w.Node;

// jsdom 的 getBoundingClientRect 恒为 0，会导致可见性判断失效，这里打桩
const rect = () => ({ width: 200, height: 24, top: 0, left: 0, right: 200, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
w.Element.prototype.getBoundingClientRect = rect as any;

const profile = emptyProfile();
Object.assign(profile.basic, {
  name: '张三',
  namePinyin: 'Zhang San',
  gender: '男',
  idType: '居民身份证',
  idCard: '210211200305011233',
  birthday: '2003-05-12',
  nation: '汉族',
  politicalStatus: '共青团员',
  hometown: '辽宁省大连市',
  birthPlace: '辽宁省大连市',
  hukou: '辽宁省大连市',
  country: '中国',
  address: '辽宁省大连市甘井子区凌工路2号',
  postalCode: '116024',
  phone: '13800000000',
  landline: '0411-84708114',
  email: 'zhangsan@example.com',
  qq: '12345678',
  wechat: 'zs2003',
  maritalStatus: '未婚',
  health: '良好',
  emergencyName: '张父',
  emergencyPhone: '13900000000',
  tuimianQual: '是',
});
Object.assign(profile.education, {
  university: '大连理工大学',
  college: '计算机科学与技术学院',
  major: '软件工程',
  className: '软件2101班',
  studentId: '2021123456',
  startDate: '2021-09',
  endDate: '2025-06',
  gpa: '3.8/4.0',
  score: '88.5',
  rank: '5',
  comprehensiveRank: '6',
  gradeRank: '10',
  rankBase: '120',
  rankUnit: '专业',
  foreignLang: '英语',
  cet4: '580',
  cet4Date: '2023-06',
  cet6: '560',
  cet6Date: '',
  obeyAdjust: '是',
});
profile.awards.push({ date: '2023-09', place: '大连理工大学', content: '校一等奖学金', level: '校级', role: '1/1' });
profile.research.push({ title: '校级大创项目', type: '项目', date: '2023-2024', role: '主要成员', description: '负责文献综述与数据整理' });
profile.socialPractice.push({ date: '2022-2023', name: '院学生会', role: '宣传部干事', detail: '负责活动宣传' });
profile.familyMembers.push({ name: '张父', relation: '父亲', org: '某公司职员', phone: '13811112222', politicalStatus: '群众' });
profile.familyMembers.push({ name: '张母', relation: '母亲', org: '某单位会计', phone: '13833334444', politicalStatus: '群众' });
profile.experiences.push({ start: '2021-09', end: '2025-06', org: '大连理工大学', role: '学生' });
profile.experiences.push({ start: '2022-07', end: '2022-08', org: '某公司', role: '实习生' });
profile.applications.push({ school: '华东理工大学', college: '光电科学与智能仪器学院', major: '测控技术与仪器', direction: '测试方向', degreeType: '学术型硕士', supervisor: '', note: '' });

const res = fillAll(profile, w.document);
console.log('STATS', JSON.stringify(res.stats));
res.items.forEach((i) => console.log(`${i.status.padEnd(13)} ${i.label}  ${i.field || ''}`));

let failedCount = 0;
function check(cond: boolean, msg: string): void {
  if (cond) console.log('PASS: ' + msg);
  else {
    console.error('FAIL: ' + msg);
    failedCount++;
  }
}

const byName = (n: string) => (w.document.querySelector(`[name="${n}"]`) as HTMLInputElement | undefined)?.value || '';
const selVal = (n: string) => (w.document.querySelector(`[name="${n}"]`) as HTMLSelectElement | undefined)?.value || '';

check(byName('xm') === '张三', '姓名填充');
check(byName('namepinyin') === 'Zhang San', '姓名拼音填充');
check(selVal('xb') === '1', '性别下拉选"男"（编码值）');
check(selVal('zjlx') === '居民身份证', '证件类型选"居民身份证"');
check(byName('sfzh') === '210211200305011233', '身份证号填充');
check(byName('csrq') === '20030512', '出生日期按 placeholder 转为 YYYYMMDD');
check(selVal('mz') === '汉族', '民族下拉选"汉族"');
check(selVal('zzmm') === '共青团员', '政治面貌下拉选"共青团员"');
check(byName('jg') === '辽宁省大连市', '籍贯填充');
check(selVal('gj') === '中国', '国籍选"中国"');
check(byName('txdz') === '辽宁省大连市甘井子区凌工路2号', '通讯地址填充');
check(byName('yzbm2') === '116024', '通信地址邮政编码填邮编而非地址（bug 回归）');
check(byName('jgd') === '辽宁省大连市', '籍贯地填充');
check(byName('csd') === '辽宁省大连市', '出生地填充');
check(byName('hkszd') === '辽宁省大连市', '户口地填充');
check(byName('txtCsd') === '', '出生地"显示框+隐藏编码"弹窗对不直接注入');
check(byName('nj0t') === '2021.09-2025.06' && byName('nj0d') === '大连理工大学' && byName('nj0z') === '学生', '学习或工作经历表第1行填充（紧凑时间格式）');
check(
  byName('jl0t') === '2023-09' && byName('jl0u') === '大连理工大学' && byName('jl0c') === '校级' && byName('jl0n') === '校一等奖学金',
  '奖励情况表填充（时间/单位=学校/原因=级别/名称）',
);
const awardItem = res.items.find((i) => i.field === 'awards[0]');
check(!!awardItem && awardItem.status === 'filled', '奖励情况表产生 filled 记录');
check(byName('xxgzjl') === '2021-09至2025-06，大连理工大学，学生；2022-07至2022-08，某公司，实习生', '学习工作经历长文本自动合成');
const hdIdx = w.document.getElementById('hdIndex') as HTMLInputElement;
check(!res.items.some((i) => i.el === hdIdx), '隐藏域 hdIndex 不误入字段清单');
check(selVal('xyjrm') === '非军人', '现役军人码默认"非军人"');
check(selVal('zzmmq') === '中国共产主义青年团团员', '政治面貌全称选项匹配（团员别名）');
check(byName('sjh') === '13800000000', '手机号填充');
check(byName('gddh') === '0411-84708114', '固定电话填充');
check(byName('jxlxr') === '张父', '紧急联系人姓名填充');
check(byName('jxlxrdh') === '13900000000', '紧急联系人电话填充（不误填为本人手机号）');
check(byName('email') === 'zhangsan@example.com', '邮箱填充');
check(byName('qq') === '12345678', 'QQ 填充');
check(byName('byyx') === '大连理工大学', '毕业学校填充');
check(byName('zy') === '软件工程', '专业填充');
check(byName('yx') === '计算机科学与技术学院', '学院填充');
check(byName('xh') === '2021123456', '学号填充');
check(selVal('sxyz') === '英语', '所学语种选"英语"');
check(byName('pjcj') === '88.5', '平均成绩填充');
check(byName('cet4') === '580', 'CET-4 填充');
check(byName('cet6') === '560', 'CET-6 填充');
check(byName('pm') === '5', '专业排名填充');
check(byName('pmrs') === '120', '专业人数填充');
check(byName('zhpm') === '6', '综合排名填充');
check(byName('njpm') === '10', '年级排名填充');
check(selVal('pmdw') === '专业', '排名单位选"专业"');
check(selVal('tmzg') === '是', '推免资格选"是"');
check(selVal('fctj') === '是', '是否服从专业调剂选中"是"（专属字段，不误入专业）');
check(selVal('sqxy') === '', '申请学院（空联动）保守不误填');
check(byName('sqzy') === '测控技术与仪器', '申请专业文本框由报考意向推导');
const zzmm2Item = res.items.find((i) => i.field === 'basic.politicalStatus' && i.status === 'failed');
check(!!zzmm2Item && (zzmm2Item.reason || '').includes('联动'), '空下拉（联动）给出人工提示');
check(byName('hjqk') === '2023-09，大连理工大学，校一等奖学金', '获奖情况 textarea 自动合成（时间/地点/内容）');
check(byName('kyjl') === '校级大创项目，项目，2023-2024，主要成员，负责文献综述与数据整理', '科研经历 textarea 自动合成');
check(byName('shsj') === '2022-2023，院学生会，宣传部干事，负责活动宣传', '社会实践 textarea 自动合成（时间/活动名称/职务/内容）');
check(byName('yzm') === '', '验证码不自动填写');
check(byName('pwd') === '', '密码不自动填写');
check(byName('jzxm') === '张父', '家长姓名填入紧急联系人');
check(byName('lxr') === '张父', '联系人姓名填入紧急联系人');
check(byName('lxdh') === '13800000000', '联系电话填充本人手机号');
check(byName('fq') === '', '父亲姓名不自动填（可人工补）');
check(byName('mq') === '', '母亲姓名不自动填（可人工补）');
check((w.document.querySelector('input[type="radio"][name="jk"][value="1"]') as HTMLInputElement).checked === true, '健康状况单选选"良好"');
check(byName('zwcs') === '', '自我陈述不自动填写（人工粘贴）');

// 弹窗选择框（只读输入框 + 选择按钮）：不注入文本，标记为 picker，等待"引导填写"处理
const byxx2 = w.document.querySelector('[name="byxx2"]') as HTMLInputElement;
check(byxx2.value === '', '弹窗选择框不直接注入文本');
const pickerItems = res.items.filter((i) => i.status === 'picker');
check(pickerItems.length === 10, '十个弹窗选择框均识别为 picker（只读×2/禁用/隐藏/Show×2/出生地弹窗对×2/籍贯代码+名称对×2）');
check(pickerItems.some((i) => i.field === 'education.university'), '弹窗学校框匹配到 education.university');
check(res.stats.picker === 10, 'stats.picker = 10');
check(byName('txtJgdm') === '' && byName('txtJg') === '', '南理工式"代码+名称"弹窗对（无隐藏域）不注入文本，避免写坏代码列');
check(byName('szxx2') === '', '禁用输入框不直接注入文本');
check(byName('szxx3') === '', '隐藏编码载体不注入文本');
check(byName('bkbydwShow') === '', 'Show 显示框不直接注入文本（走弹窗）');
check(byName('bkbyzyShow') === '', 'Show 专业显示框不直接注入文本（走弹窗）');
check(findPickerTrigger(byxx2) !== null, '识别到「选择」触发按钮');
const opt = findPickerOption(w.document, '汉族');
check(!!opt && (opt as HTMLElement).textContent!.trim() === '汉族', '浮层选项精确匹配（role=option）');
check(findPickerOption(w.document, '不存在的值') === null, '浮层选项无匹配返回 null');

// ECUST 风格：编码选项 / 联动 / 档案推导
check(byName('csny') === '2003-05', '出生年月只填到月（YYYY-MM）');
check(byName('rxny') === '2021-09', '只读日期框直接注入入学年月');
check(byName('byny') === '2025-06', '只读日期框直接注入预计毕业年月');
check(byName('wycj') === '580', '英语成绩填 CET-4 分');
check(selVal('ddlss') === '辽宁', '院校所在省市由学校名自动推导（大连理工→辽宁）');
check(selVal('ddlyx') === '大连理工大学', '就读院校选中本校');
check(selVal('ddlbkzy') === '080714|软件工程', '编码选项"代码|名称"按名称部分匹配');
check(byName('qtdh') === '13900000000', '亲属电话填紧急联系人电话');
check(selVal('zslx') === '硕士', '申请类型由报考意向推导（学术型硕士→硕士）');
check(selVal('ddsqzy') === '080302|测控技术与仪器', '申请专业由报考意向推导并匹配编码选项');
check(selVal('yxds') === '无', '是否有意向导师推导为"无"');
check(selVal('yjfx') === '测试方向', '研究方向由报考意向推导');
check(selVal('ddsqxy') === '光电科学与智能仪器学院', '申请学院由报考意向推导');
check(byName('jlcf') === '2023-09，大连理工大学，校一等奖学金', '奖励处分 textarea 自动合成（时间/地点/内容）');
check(byName('fblw') === '校级大创项目，项目，2023-2024，主要成员，负责文献综述与数据整理', '发表论文 textarea 自动合成');
check((w.document.querySelector('input[type="radio"][name="rbwysp"][value="1"]') as HTMLInputElement).checked === true, '国家四级推导"通过"（580≥425）');

// 外语水平表格（表头在首行）
check(byName('lbmc') === '大学英语四级（CET-4）', '外语水平名称自动填');
check(byName('cj') === '580', '外语水平成绩自动填');
check(byName('sj') === '2023-06-01', '外语水平时间按表头格式补全日');
check(byName('bz0') === '', '备注列保持人工');
const cetItem = res.items.find((i) => i.field === 'education.cet4' && i.status === 'filled');
check(!!cetItem, '外语水平表格产生 filled 记录');

// 档案缺少"四级取得时间"时：时间框黄色标记提醒 + 计入漏填清单（不无声跳过）
const p2 = emptyProfile();
Object.assign(p2.education, { cet4: '580', cet4Date: '' });
const res2 = fillAll(p2, w.document);
const sjEl = w.document.querySelector('[name="sj"]') as HTMLInputElement;
check(sjEl.getAttribute('data-tui') === 'empty', '外语水平时间缺失时黄色标记提醒');
check(res2.items.some((i) => i.status === 'profileEmpty' && i.field === 'education.cet4Date'), '时间缺失计入漏填清单（复制漏填项可见）');

// 时间写法兼容："2025年6月" 自动转 "2025-06-01"
const p3 = emptyProfile();
Object.assign(p3.education, { cet4: '580', cet4Date: '2025年6月' });
fillAll(p3, w.document);
check(byName('sj') === '2025-06-01', '外语水平时间兼容"2025年6月"写法并补全日');

// 家庭成员表格（列头定义含义）
check(byName('f0x') === '张父', '家庭成员表第1行姓名');
check(byName('f0g') === '父亲', '家庭成员表第1行关系');
check(byName('f0d') === '某公司职员', '家庭成员表第1行单位');
check(byName('f0p') === '13811112222', '家庭成员表第1行电话');
check(selVal('f0z') === '群众', '家庭成员表第1行政治面貌');
check(byName('f1x') === '张母', '家庭成员表第2行姓名');
check(selVal('f1z') === '群众', '家庭成员表第2行政治面貌');
const famItem = res.items.find((i) => i.field === 'familyMembers[0]');
check(!!famItem && famItem.status === 'filled', '家庭成员表产生 filled 记录');
check(!res.items.some((i) => i.field === 'basic.name' && i.label === ''), '成员表输入框不再进入常规匹配');

// ===== 反向提取（南航场景：页面上已有用户手填的值 → 导入档案） =====
const p4 = emptyProfile();
(w.document.querySelector('[name="xm"]') as HTMLInputElement).value = '李四';
(w.document.querySelector('[name="sjh"]') as HTMLInputElement).value = '13911110000';
(w.document.querySelector('[name="ddlbkzy"]') as HTMLSelectElement).value = '080714|软件工程';
(w.document.querySelector('[name="f0x"]') as HTMLInputElement).value = '李父';
(w.document.querySelector('[name="f0g"]') as HTMLInputElement).value = '父亲';
(w.document.querySelector('[name="f0d"]') as HTMLInputElement).value = '某公司';
(w.document.querySelector('[name="f0p"]') as HTMLInputElement).value = '13911112222';
(w.document.querySelector('[name="f0z"]') as HTMLSelectElement).value = '群众';
(w.document.querySelector('[name="f1x"]') as HTMLInputElement).value = '李母';
(w.document.querySelector('[name="f1g"]') as HTMLInputElement).value = '母亲';
(w.document.querySelector('[name="cj"]') as HTMLInputElement).value = '457';
(w.document.querySelector('[name="sj"]') as HTMLInputElement).value = '2024-06-01';
(w.document.querySelector('[name="wycj"]') as HTMLInputElement).value = ''; // 清掉前序填充残留，模拟南航页面只有外语水平表
(w.document.querySelector('[name="cet4"]') as HTMLInputElement).value = '';
(['nj0t', 'nj0d', 'nj0z'] as const).forEach((n) => {
  (w.document.querySelector(`[name="${n}"]`) as HTMLInputElement).value = '';
}); // 清掉南理工经历表填充残留，模拟未填页面
(['jl0t', 'jl0u', 'jl0c', 'jl0n'] as const).forEach((n) => {
  (w.document.querySelector(`[name="${n}"]`) as HTMLInputElement).value = '';
}); // 清掉奖励情况表填充残留，模拟未填页面
const imp = importFromPage(p4, w.document);
check(p4.basic.name === '李四', '反向提取：姓名');
check(p4.basic.phone === '13911110000', '反向提取：手机号');
check(p4.education.major === '软件工程', '反向提取：下拉选中项取名称部分（去编码）');
check(p4.education.cet4 === '457', '反向提取：四级成绩');
check(p4.education.cet4Date === '2024-06', '反向提取：取得时间截断到月');
check(p4.familyMembers.length === 2 && p4.familyMembers[0].name === '李父', '反向提取：家庭成员表两行');
check(p4.research.length === 1 && p4.research[0].title === '基于XX的研究', '反向提取：学术成果表');
check(p4.awards.length === 1 && p4.awards[0].content === '获校一等奖学金' && p4.awards[0].place === '南京' && p4.awards[0].date === '2023-09', '反向提取：奖励情况表（时间/地点/内容）');
check(
  p4.experiences.length === 1 &&
    p4.experiences[0].org === '某大学' &&
    p4.experiences[0].role === '学生' &&
    p4.experiences[0].start === '2021-09' &&
    p4.experiences[0].end === '2025-06',
  '反向提取：学习工作经历表（起止时间+单位+职务）',
);
check(imp.summary.length >= 6, '反向提取：产生摘要');

// 反向提取增强：单选/复选组按选中项导入
{
  const wImp = new JSDOM(
    '<body><form>' +
      '<div>性别</div>' +
      '<label><input type="radio" name="sex" value="1">男</label>' +
      '<label><input type="radio" name="sex" value="2" checked>女</label>' +
      '<div>是否服从调剂</div>' +
      '<label><input type="checkbox" name="tiaoj" checked>服从调剂</label>' +
      '</form></body>',
  );
  wImp.window.Element.prototype.getBoundingClientRect = rect as never;
  const pImp = emptyProfile();
  importFromPage(pImp, wImp.window.document);
  check(pImp.basic.gender === '女', '反向提取：单选组按选中项导入性别');
  check(pImp.education.obeyAdjust === '是', '反向提取：复选组勾选导入"是"');
}

// 反向提取增强：外语水平表按行内名称匹配四六级（不依赖行顺序）
{
  const wCet3 = new JSDOM(
    '<body><table><tbody><tr><th>外语水平名称</th><th>成绩</th><th>取得成绩时间</th></tr>' +
      '<tr><td><input value="大学英语六级（CET-6）"></td><td><input value="500"></td><td><input value="2025-06"></td></tr>' +
      '<tr><td><input value="大学英语四级（CET-4）"></td><td><input value="457"></td><td><input value="2023-06"></td></tr></tbody></table></body>',
  );
  const pCet3 = emptyProfile();
  importFromPage(pCet3, wCet3.window.document);
  check(
    pCet3.education.cet4 === '457' && pCet3.education.cet6 === '500' && pCet3.education.cet4Date === '2023-06' && pCet3.education.cet6Date === '2025-06',
    '反向提取：六级在前也能按名称正确归类四六级',
  );
}

// 反向提取增强：同源 iframe 内的表单字段也能提取
{
  const wIfr = new JSDOM('<body><iframe id="f1"></iframe></body>', { runScripts: 'dangerously' });
  wIfr.window.Element.prototype.getBoundingClientRect = rect as never;
  const ifr = wIfr.window.document.getElementById('f1') as HTMLIFrameElement;
  const ifrDoc = ifr.contentDocument as Document;
  ifrDoc.defaultView!.Element.prototype.getBoundingClientRect = rect as never;
  ifrDoc.body.innerHTML = '<table><tbody><tr><td>姓 名</td><td><input name="xm2" value="张三"></td></tr></tbody></table>';
  const pIfr = emptyProfile();
  importFromPage(pIfr, wIfr.window.document);
  check(pIfr.basic.name === '张三', '反向提取：同源 iframe 内字段被提取');
}

// 自愈：只读日历框打开收起后被重置成当前月份 → 自动恢复档案日期（苏大"入学=毕业"事故）
void (async () => {
  const wDt = new JSDOM(
    '<body><table><tbody><tr><td>入学年月*</td><td><input name="rxny" readonly></td></tr>' +
      '<tr><td>预计毕业年月*</td><td><input name="byny" readonly></td></tr></tbody></table></body>',
  );
  wDt.window.Element.prototype.getBoundingClientRect = rect as never;
  const rx = wDt.window.document.querySelector('[name="rxny"]') as HTMLInputElement;
  const by = wDt.window.document.querySelector('[name="byny"]') as HTMLInputElement;
  for (const el of [rx, by]) {
    el.addEventListener('click', () => {
      el.value = '2026-08'; // 模拟 My97 日历点开即写入当前月份
    });
  }
  const pDt = emptyProfile();
  Object.assign(pDt.education, { startDate: '2021-09', endDate: '2025-06' });
  fillAll(pDt, wDt.window.document);
  await sleep(700);
  check(rx.value === '2021-09' && by.value === '2025-06', '只读日历框被日历重置后自动恢复（入学≠毕业）');
})();

// 旧版获奖档案迁移：{name, level, date, role} → 时间/地点/内容
{
  const oldRaw = {
    basic: { name: '测试' },
    education: { university: '西安理工大学' },
    awards: [
      { name: '西安理工大学·优秀学生干部', level: '校级', date: '2024-11', role: '1/1' },
      { name: '校一等奖学金', level: '校级', date: '2023-09', role: '1/1' },
    ],
  };
  const migrated = normalizeProfile(oldRaw);
  check(
    migrated.awards.length === 2 && migrated.awards[0].place === '西安理工大学' && migrated.awards[0].content === '优秀学生干部' && migrated.awards[0].date === '2024-11',
    '旧版获奖档案迁移为时间/地点/内容（前缀拆分）',
  );
  check(
    migrated.awards[1].place === '西安理工大学' && migrated.awards[1].content === '校一等奖学金',
    '旧版获奖无前缀时地点回退为毕业院校',
  );
}

// 导入家庭成员按姓名合并，不覆盖已有成员
(['f0x', 'f1x'] as const).forEach((n) => {
  (w.document.querySelector(`[name="${n}"]`) as HTMLInputElement).value = '';
});
const tblImp = w.document.createElement('table');
tblImp.innerHTML =
  '<tbody><tr><th>成员姓名</th><th>与本人关系</th><th>工作单位及职务</th><th>联系电话</th></tr>' +
  '<tr><td><input name="imp0n" value="靳文"></td><td><input name="imp0r" value="母子"></td><td><input name="imp0o" value="个体经营"></td><td><input name="imp0p" value="18291467707"></td></tr></tbody>';
w.document.body.appendChild(tblImp);
const pImp = emptyProfile();
pImp.familyMembers.push({ name: '张父', relation: '父亲', org: '某公司', phone: '13811112222', politicalStatus: '' });
importFromPage(pImp, w.document);
check(
  pImp.familyMembers.length === 2 && pImp.familyMembers.some((m) => m.name === '张父') && pImp.familyMembers.some((m) => m.name === '靳文'),
  '反向提取家庭成员按姓名合并，不覆盖已有成员',
);
tblImp.remove();

// 站点架构扫描（"先读架构再操作"）
const scan0 = scanSite(w.document);
check(scan0.gridTables.some((t) => t.purpose === 'family'), '站点架构扫描：识别家庭成员网格');
check(scan0.gridTables.some((t) => t.purpose === 'awards'), '站点架构扫描：识别奖励情况网格');
check(scan0.gridTables.some((t) => t.purpose === 'experiences'), '站点架构扫描：识别学习/工作经历网格');
check(scan0.inputs > 20 && scan0.gridTables.length >= 4, '站点架构扫描：统计表单控件与网格数量');
check(scan0.pickers.length >= 8, '站点架构扫描：识别弹窗触发器');

// 提交前体检
check(isValidIdCard('210211200305011233') === true, '体检：合法身份证通过校验');
check(isValidIdCard('123') === false, '体检：非法身份证被拦截');
const checkRes = runPreSubmitCheck(w.document);
check(checkRes.items.some((i) => i.level === 'warn' && i.title.includes('手机号')) === false, '体检：合法手机号不误报');
check(checkRes.items.some((i) => i.title.includes('仍有未完成项')), '体检：捕获红色/黄色残留未完成项');

// 远程规则合并
check(allAdapters({ adapters: [{ id: 'x', name: '测试平台', match: () => false, autoShow: true }] }).length === ADAPTERS.length + 1, '远程适配器合并生效');
check(allAdapters(null).length === ADAPTERS.length, '无远程规则时使用静态适配器');
let genOk = true;
for (let i = 0; i < 5; i++) {
  const p = generateTestProfile();
  const idc = p.basic.idCard;
  const birthYmd = p.basic.birthday.replace(/-/g, '');
  const body = idc.slice(0, 17);
  let sum = 0;
  for (let j = 0; j < 17; j++) sum += parseInt(body[j], 10) * [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2][j];
  if (idc[17] !== '10X98765432'[sum % 11]) genOk = false;
  if (idc.slice(6, 14) !== birthYmd) genOk = false;
  if (!p.basic.name || !p.basic.namePinyin || !p.basic.phone || !p.education.university || !p.awards.length || !p.selfStatements.length) genOk = false;
}
check(genOk, '测试数据生成器：5 次生成均合法（校验位/生日一致、关键字段非空）');

if (failedCount > 0) {
  console.error(`\n${failedCount} 项断言失败`);
  process.exit(1);
} else {
  console.log('\n全部断言通过 ✅');
}

// 弹窗选择自动点选（异步）
void (async () => {
  const target = w.document.querySelector('[name="bkbydwShow"]') as HTMLInputElement;
  // 模拟真实弹窗：点击选项后回填主页面输入框（否则工具会继续走选择器窗口流程）
  w.document.querySelectorAll('.popup [role="option"]').forEach((li: Element) => {
    li.addEventListener('click', () => {
      target.value = (li.textContent || '').trim();
    });
  });
  const r = await pickInPage(w.document, target, '西安电子科技大学');
  check(r === 'picked', '弹窗选择自动点选（打开选择器→匹配选项→点击）');

  // 省市县树形弹层：按 省/市/区 逐级点选（南理工籍贯/出生地/户口地）
  const treeWrap = w.document.createElement('div');
  treeWrap.style.cssText = 'position:absolute;left:100px;top:100px';
  treeWrap.innerHTML =
    '<div class="tree-node"><span class="tree-title">陕西省</span></div>' +
    '<div class="tree-node"><span class="tree-title">西安市</span></div>' +
    '<div class="tree-node"><span class="tree-title">未央区</span></div>';
  w.document.body.appendChild(treeWrap);
  const regionCell = w.document.createElement('div');
  regionCell.innerHTML = '<input name="regionT"><button type="button" class="select-btn">选择</button>';
  w.document.body.appendChild(regionCell);
  const rr = await pickInPage(w.document, regionCell.querySelector('input')!, '陕西省西安市未央区');
  check(rr === 'picked', '省市县树形弹层逐级点选（籍贯/出生地/户口地）');
  treeWrap.remove();
  regionCell.remove();

  // 弹层嵌在同源 iframe 内：仍能逐级点选
  const frameEl = w.document.createElement('iframe');
  w.document.body.appendChild(frameEl);
  const fd = frameEl.contentDocument as Document;
  if (fd && fd.defaultView) {
    (fd.defaultView as any).Element.prototype.getBoundingClientRect = rect;
  }
  fd.body.innerHTML =
    '<div class="tree-node"><span class="tree-title">山西省</span></div>' +
    '<div class="tree-node"><span class="tree-title">陕西省</span></div>' +
    '<div class="tree-node"><span class="tree-title">西安市</span></div>' +
    '<div class="tree-node"><span class="tree-title">未央区</span></div>';
  const regionCell2 = w.document.createElement('div');
  regionCell2.innerHTML = '<input name="regionT2"><button type="button" class="select-btn">选择</button>';
  w.document.body.appendChild(regionCell2);
  const rr2 = await pickInPage(w.document, regionCell2.querySelector('input')!, '陕西省西安市未央区');
  check(rr2 === 'picked', '同源 iframe 弹层内逐级点选地区树');
  frameEl.remove();
  regionCell2.remove();

  // 东华大学式分层树：`<a class="level0">陕西省</a>` 链接节点（layui treeSelectPage?lbcode=area）
  const frameDhu = w.document.createElement('iframe');
  w.document.body.appendChild(frameDhu);
  const ddhu = frameDhu.contentDocument as Document;
  if (ddhu && ddhu.defaultView) {
    (ddhu.defaultView as any).Element.prototype.getBoundingClientRect = rect;
  }
  ddhu.body.innerHTML =
    '<a class="level0">其他</a><a class="level0">北京市</a><a class="level0">陕西省</a>' +
    '<a class="level1">西安市</a>' +
    '<a class="level2" onclick="this.setAttribute(\'data-hit\',\'1\')">未央区</a>';
  const regionCell3 = w.document.createElement('div');
  regionCell3.innerHTML = '<input name="regionT3"><button type="button" class="select-btn">选择</button>';
  w.document.body.appendChild(regionCell3);
  const rr3 = await pickInPage(w.document, regionCell3.querySelector('input')!, '陕西省西安市未央区');
  check(rr3 === 'picked' && !!ddhu.querySelector('[data-hit="1"]'), '东华大学式 <a class="levelN"> 分层树逐级点选并点中末级');
  frameDhu.remove();
  regionCell3.remove();

  // 南理工专业选择器（SelBkdzZydm）：类别下拉按门类过滤（测控技术与仪器 → 工学）后关键字查询点选
  {
    const frameZy = w.document.createElement('iframe');
    w.document.body.appendChild(frameZy);
    const zd = frameZy.contentDocument as Document;
    if (zd && zd.defaultView) {
      (zd.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    }
    zd.body.innerHTML =
      '<select name="drpKind"><option value="">--请选择--</option>' +
      '<option value="1">哲学</option><option value="2">经济学</option><option value="3">法学</option>' +
      '<option value="4">教育学</option><option value="5">文学</option><option value="6">历史学</option>' +
      '<option value="7">理学</option><option value="8">工学</option><option value="9">农学</option>' +
      '<option value="10">医学</option><option value="11">管理学</option></select>' +
      '<input type="text" name="txtWord">' +
      '<a href="javascript:void(0)" onclick="this.setAttribute(\'data-query\',\'1\')">查询</a>' +
      '<table><tbody><tr><td>080301</td><td>测控技术与仪器</td><td><input type="image" onclick="this.setAttribute(\'data-hit\',\'1\')"></td></tr></tbody></table>';
    const zyCell = w.document.createElement('div');
    zyCell.innerHTML = '<input name="zyDm"><input name="zyMc"><input name="zyT"><button type="button" class="select-btn">选择</button>';
    w.document.body.appendChild(zyCell);
    const rz = await pickInPage(w.document, zyCell.querySelector('[name="zyT"]')!, '测控技术与仪器');
    check(rz === 'picked', '专业选择器：类别过滤后关键字查询点选成功');
    check((zd.querySelector('select') as HTMLSelectElement).value === '8' && !!zd.querySelector('[data-hit="1"]'), '专业选择器：类别自动设为工学（门类猜测）');
    frameZy.remove();
    zyCell.remove();
  }

  // 东华代码/名称树弹层（treeSelectPage?lbcode=getZY）：关键字搜索 + 点节点（"080301 测控技术与仪器"）
  {
    const frameCode = w.document.createElement('iframe');
    w.document.body.appendChild(frameCode);
    const cd = frameCode.contentDocument as Document;
    if (cd && cd.defaultView) {
      (cd.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    }
    cd.body.innerHTML =
      '<input type="text" id="keyword">' +
      '<button onclick="this.setAttribute(\'data-query\',\'1\')">搜索</button>' +
      '<a class="level0">工学</a>' +
      '<a class="level1" onclick="this.setAttribute(\'data-hit\',\'1\')">080301 测控技术与仪器</a>';
    const codeCell = w.document.createElement('div');
    codeCell.innerHTML = '<input name="zy2Dm"><input name="zy2Mc"><input name="zy2T"><button type="button" class="select-btn">选择</button>';
    w.document.body.appendChild(codeCell);
    const rc = await pickInPage(w.document, codeCell.querySelector('[name="zy2T"]')!, '测控技术与仪器');
    check(rc === 'picked' && !!cd.querySelector('[data-hit="1"]'), '代码/名称树弹层：关键字搜索后点中专业节点');
    frameCode.remove();
    codeCell.remove();
  }

  // 回发型选择器窗口（南理工 SelUniversity 形态：iframe + 关键字 + 查询按钮 + 编码/名称表格 + 行内"选择"）
  const selFrame = w.document.createElement('iframe');
  w.document.body.appendChild(selFrame);
  const sd = selFrame.contentDocument as Document;
  if (sd && sd.defaultView) {
    (sd.defaultView as any).Element.prototype.getBoundingClientRect = rect;
  }
  sd.body.innerHTML =
    '<table><tbody><tr><td>类别：<select name="drpKind"><option value="">--请选择--</option><option>工学</option><option>理学</option></select></td>' +
    '<td><input name="txtWord"></td>' +
    '<td><a href="javascript:void(0)" onclick="this.setAttribute(\'data-hit\',\'1\')">查询</a></td></tr></tbody></table>' +
    '<table><tbody><tr><td>10001</td><td>西安理工大学</td>' +
    '<td><input type="image" onclick="this.setAttribute(\'data-hit\',\'1\')"></td></tr></tbody></table>';
  const selCell = w.document.createElement('div');
  selCell.innerHTML =
    '<input name="uniT"><button type="button" class="select-btn">选择</button>' +
    '<input name="uniTdm" type="hidden"><input name="uniTmc" type="hidden">';
  w.document.body.appendChild(selCell);
  // 模拟真实服务器：点行内选择后回填码+名成对输入框
  const uniTdm = selCell.querySelector('[name="uniTdm"]') as HTMLInputElement;
  const uniTmc = selCell.querySelector('[name="uniTmc"]') as HTMLInputElement;
  sd.querySelectorAll('input[type="image"]').forEach((img) => {
    img.addEventListener('click', () => {
      uniTdm.value = '10001';
      uniTmc.value = '西安理工大学';
    });
  });
  const rs = await pickInPage(w.document, selCell.querySelector('input')!, '西安理工大学');
  const hitEl = sd.querySelector('input[data-hit="1"]');
  check(rs === 'picked' && !!hitEl, '回发型选择器窗口自动点选（关键字→查询→图标型「选择」按钮）');
  check((sd.querySelector('select') as HTMLSelectElement).value === '', '选择器窗口不设类别下拉（关键字直查，少一次回发）');
  check(uniTdm.value === '10001' && uniTmc.value === '西安理工大学', '点选后码+名成对回填');
  selFrame.remove();
  selCell.remove();

  // 学术成果表：自动"新增一行"并逐条填写
  const pA = emptyProfile();
  pA.research.push({ title: '成果A', type: '论文', date: '2024-03', role: '1/3', description: '发表刊物或出版社：某期刊' });
  pA.research.push({ title: '成果B', type: '论文', date: '2024-05', role: '2/4', description: '发表刊物或出版社：另一期刊' });
  const n = await fillAchievements(pA, w.document);
  check(n === 2, '学术成果自动新增行并填写 2 条');
  const foundA = (Array.from(w.document.querySelectorAll('input')) as HTMLInputElement[]).some((i) => i.value === '成果A');
  const foundB = (Array.from(w.document.querySelectorAll('input')) as HTMLInputElement[]).some((i) => i.value === '成果B');
  check(foundA, '首行已填入第一条成果');
  check(foundB, '自动新增的行已填入第二条成果');

  // 学习/工作经历表：自动"新增一行"并逐条填写
  const pE = emptyProfile();
  pE.experiences.push({ start: '2018-09', end: '2021-06', org: '某高中', role: '学生' });
  pE.experiences.push({ start: '2021-09', end: '2025-06', org: '某大学', role: '学生' });
  const m = await fillExperiences(pE, w.document);
  check(m === 2, '学习/工作经历自动新增行并填写 2 条');
  const foundHighSchool = (Array.from(w.document.querySelectorAll('input')) as HTMLInputElement[]).some((i) => i.value === '某高中');
  check(foundHighSchool, '自动新增的经历行已填入第二条内容');

  // 北邮风格经历表头（学习起止时间/学习或工作单位名称/担任职务）——独立 JSDOM 实例，避免与前面用例的 DOM 导航互相污染
  {
    const w2 = new JSDOM(
      '<body><table><tbody><tr><th>学习起止时间</th><th>学习或工作单位名称</th><th>担任职务</th></tr>' +
        '<tr><td><input name="exp2t"></td><td><input name="exp2o"></td><td><input name="exp2r"></td></tr></tbody></table></body>',
    );
    const d2 = w2.window.document;
    const pE2 = emptyProfile();
    pE2.experiences.push({ start: '2021-09', end: '2025-06', org: '西安理工大学', role: '学生' });
    const nE2 = await fillExperiences(pE2, d2);
    const exp2o = d2.querySelector('[name="exp2o"]') as HTMLInputElement;
    check(nE2 === 1 && !!exp2o && exp2o.value === '西安理工大学', '北邮风格"学习起止时间"表头识别并填写经历');
  }

  // 东华式经历表：起始时间/结束时间分列 + 日期格式 2019-11（外层还有 1 行包装大表，须选中内层真网格）
  {
    const wDhu = new JSDOM(
      '<body>' +
        '<table><tbody><tr><td>学习和工作经历（从高中开始填写） 起始时间（日期格式：2019-11） 结束时间（日期格式：2019-11） 学校或工作单位 担任职务 新增一行</td></tr></tbody></table>' +
        '<table id="dhuExp"><tbody><tr><th>起始时间（日期格式：2019-11）</th><th>结束时间（日期格式：2019-11）</th><th>学校或工作单位</th><th>担任职务</th></tr>' +
        '<tr><td><input name="d0t1"></td><td><input name="d0t2"></td><td><input name="d0o"></td><td><input name="d0r"></td></tr>' +
        '<tr><td><input name="d1t1"></td><td><input name="d1t2"></td><td><input name="d1o"></td><td><input name="d1r"></td></tr></tbody></table>' +
        '</body>',
    );
    const dd = wDhu.window.document;
    const pDhu = emptyProfile();
    pDhu.experiences.push({ start: '2020-09', end: '2023-06', org: '某高中', role: '学生' });
    pDhu.experiences.push({ start: '2023-09', end: '2027-06', org: '某大学', role: '学生' });
    const nDhu = await fillExperiences(pDhu, dd, 0, undefined, 0);
    const d0t1 = dd.querySelector('[name="d0t1"]') as HTMLInputElement;
    const d0t2 = dd.querySelector('[name="d0t2"]') as HTMLInputElement;
    const d1o = dd.querySelector('[name="d1o"]') as HTMLInputElement;
    check(nDhu === 2, '东华式经历表（起始/结束分列）填入 2 条且不点"新增一行"');
    check(d0t1.value === '2020-09' && d0t2.value === '2023-06', '东华式经历表：时间按 2019-11 格式分列写入');
    check(d1o.value === '某大学', '东华式经历表：第二条填入单位列');
    const dhuHit = findExperienceTable(dd);
    check(!!dhuHit && dhuHit.table.id === 'dhuExp', '包装大表（无输入控件）不压过内层真网格');
  }

  // 巨能填式结构否决：表头像经历表、行内却是 入学/毕业年月 等标量字段的表不当经历表
  {
    const wScalar = new JSDOM(
      '<body><table id="scalarTbl"><tbody><tr><th>起始时间</th><th>结束时间</th><th>学校</th></tr>' +
        '<tr><td><input name="rxny"></td><td><input name="byny"></td><td><input name="byyxmc"></td></tr></tbody></table></body>',
    );
    const dS = wScalar.window.document;
    const pS2 = emptyProfile();
    pS2.experiences.push({ start: '2020-09', end: '2023-06', org: '某高中', role: '学生' });
    const nS2 = await fillExperiences(pS2, dS, 0, undefined, 0);
    const rx = dS.querySelector('[name="rxny"]') as HTMLInputElement;
    check(nS2 === 0 && rx.value === '', '标量学习信息表（rxny/byny 字段）不被误当经历表写入');
  }

  // 加行增长验证：点了「新增一行」但行数没变 → 不再连点（防东华式无限加行）
  {
    const wG = new JSDOM(
      '<body>' +
        '<table id="gTbl"><tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th></tr>' +
        '<tr><td><input name="g0t"></td><td><input name="g0o"></td><td><input name="g0r"></td></tr></tbody></table>' +
        '<button id="gAdd">新增一行</button></body>',
    );
    const dg = wG.window.document;
    wG.window.Element.prototype.getBoundingClientRect = rect as never;
    let clicks = 0;
    (dg.getElementById('gAdd') as HTMLButtonElement).addEventListener('click', () => {
      clicks += 1;
    });
    const pG = emptyProfile();
    pG.experiences.push({ start: '2018-09', end: '2021-06', org: '某高中', role: '学生' });
    pG.experiences.push({ start: '2021-09', end: '2025-06', org: '某大学', role: '学生' });
    const calls: number[] = [];
    const nG = await fillExperiences(pG, dg, 0, (i) => {
      calls.push(i);
      return calls.length - 1;
    }, 3);
    check(nG === 1, '加行按钮无效（行数不增长）时只填现有行，不无限连点');
    check(clicks === 1, '行数未增长时只点击一次「新增一行」');
    check((dg.querySelector('[name="g0o"]') as HTMLInputElement).value === '某高中', '现有行仍正常填入第一条');
  }

  // 无「职务」列的两列表：职务并入单位格（对齐巨能填缺列合并策略）
  {
    const wM = new JSDOM(
      '<body><table><tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th></tr>' +
        '<tr><td><input name="mg0t"></td><td><input name="mg0o"></td></tr></tbody></table></body>',
    );
    const pM = emptyProfile();
    pM.experiences.push({ start: '2020-09', end: '2023-06', org: '西安市第七十五中学', role: '劳动委员' });
    const nM = await fillExperiences(pM, wM.window.document, 0, undefined, 0);
    const mg0o = wM.window.document.querySelector('[name="mg0o"]') as HTMLInputElement;
    check(nM === 1 && mg0o.value === '西安市第七十五中学，劳动委员', '无职务列时职务并入单位格');
  }

  // 东华式学术成果表：真网格表头只有"标题"，"成果/论文"字样只在外层标题表 → 仍须识别并填写
  {
    const wAch = new JSDOM(
      '<body>' +
        '<table><tbody><tr><td>学术成果（包括荣获奖项、发表论文、学术活动等）（最多5项）</td></tr></tbody></table>' +
        '<table id="achTbl"><tbody><tr><th>时间（日期格式：2018-11）</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td><input name="ac0t"></td><td><input name="ac0j"></td><td><input name="ac0n"></td><td><input name="ac0r"></td></tr>' +
        '<tr><td><input name="ac1t"></td><td><input name="ac1j"></td><td><input name="ac1n"></td><td><input name="ac1r"></td></tr></tbody></table>' +
        '</body>',
    );
    const dA = wAch.window.document;
    const pA2 = emptyProfile();
    pA2.research.push({ title: '第十二届全国大学生机械设计大赛全国三等奖', type: '竞赛', date: '2024-06', role: '1/3', description: '' });
    pA2.research.push({ title: '机械工程学报', type: '论文', date: '2024-09', role: '2/4', description: '发表刊物或出版社：机械工程学报' });
    const nA2 = await fillAchievements(pA2, dA, 0, undefined, 0);
    const ac0n = dA.querySelector('[name="ac0n"]') as HTMLInputElement;
    const ac1n = dA.querySelector('[name="ac1n"]') as HTMLInputElement;
    const ac1j = dA.querySelector('[name="ac1j"]') as HTMLInputElement;
    check(nA2 === 2, '东华式学术成果表（表头仅"标题"）识别并填写 2 条');
    check(ac0n.value === '第十二届全国大学生机械设计大赛全国三等奖', '成果标题写入标题列');
    check(ac1n.value === '机械工程学报' && ac1j.value === '机械工程学报', '发表刊物列剥掉"发表刊物或出版社："前缀');
    const achHit = findAchievementTable(dA);
    check(!!achHit && achHit.table.id === 'achTbl', '学术成果外层标题表（1 行）不被误选');
  }

  // 负例：纯"标题+时间"的通知列表不算学术成果表（无刊物/排名伴生列）
  {
    const wNews = new JSDOM(
      '<body><table><tbody><tr><th>标题</th><th>发布时间</th></tr>' +
        '<tr><td><input name="nw0t"></td><td><input name="nw0d"></td></tr></tbody></table></body>',
    );
    const dN = wNews.window.document;
    const pN2 = emptyProfile();
    pN2.research.push({ title: '某成果', type: '论文', date: '2024-03', role: '1/1' });
    const nN2 = await fillAchievements(pN2, dN, 0, undefined, 0);
    check(nN2 === 0 && (dN.querySelector('[name="nw0t"]') as HTMLInputElement).value === '', '标题+时间通知列表不被误当学术成果表');
  }

  // 加行处理器绑定在 mousedown（无 click 处理器）：完整事件序列仍能触发加行
  {
    const wMd = new JSDOM(
      '<body>' +
        '<table id="mdTbl"><tbody><tr><th>时间（日期格式：2018-11）</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td><input name="md0t"></td><td><input name="md0j"></td><td><input name="md0n"></td><td><input name="md0r"></td></tr></tbody></table>' +
        '<button id="mdAdd">新增一行</button></body>',
    );
    const dMd = wMd.window.document;
    wMd.window.Element.prototype.getBoundingClientRect = rect as never;
    (dMd.getElementById('mdAdd') as HTMLButtonElement).addEventListener('mousedown', () => {
      const t = dMd.getElementById('mdTbl') as HTMLTableElement;
      const r = t.querySelector('tbody')!.insertRow();
      r.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
    });
    const pMd = emptyProfile();
    pMd.research.push({ title: '成果一', type: '论文', date: '2024-03', role: '1/1' });
    pMd.research.push({ title: '成果二', type: '论文', date: '2024-05', role: '2/3' });
    const nMd = await fillAchievements(pMd, dMd, 0, undefined, 3);
    check(nMd === 2, 'mousedown 绑定的加行处理器也能被触发（完整事件序列）');
    check((dMd.querySelector('[name="md0n"]') as HTMLInputElement).value === '成果一', 'mousedown 触发加行后第一条写入原行');
  }

  // 禁用的「新增一行」按钮：跳过不点（防点了没反应还误报进度）
  {
    const wDis = new JSDOM(
      '<body>' +
        '<table id="disTbl"><tbody><tr><th>时间（日期格式：2018-11）</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td><input name="ds0t"></td><td><input name="ds0j"></td><td><input name="ds0n"></td><td><input name="ds0r"></td></tr></tbody></table>' +
        '<button id="disAdd" disabled>新增一行</button></body>',
    );
    const dDis = wDis.window.document;
    wDis.window.Element.prototype.getBoundingClientRect = rect as never;
    let disClicks = 0;
    (dDis.getElementById('disAdd') as HTMLButtonElement).addEventListener('click', () => {
      disClicks += 1;
    });
    const pDis = emptyProfile();
    pDis.research.push({ title: '成果一', type: '论文', date: '2024-03', role: '1/1' });
    pDis.research.push({ title: '成果二', type: '论文', date: '2024-05', role: '2/3' });
    const nDis = await fillAchievements(pDis, dDis, 0, undefined, 3);
    check(nDis === 1 && disClicks === 0, '禁用按钮被跳过：只填现有行、不点按钮');
  }

  // 回归：扩展自身 UI（横幅/面板）永不当作"新增"按钮；真按钮被选中并加行
  {
    const wUi = new JSDOM(
      '<body>' +
        '<table id="uiTbl"><tbody><tr><th>时间（日期格式：2018-11）</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td><input name="ui0t"></td><td><input name="ui0j"></td><td><input name="ui0n"></td><td><input name="ui0r"></td></tr></tbody></table>' +
        '<span class="tui-banner-title">🔄 正在自动添加</span>' +
        '<button id="uiAdd">新增一行</button></body>',
    );
    const dUi = wUi.window.document;
    wUi.window.Element.prototype.getBoundingClientRect = rect as never;
    let uiClicks = 0;
    (dUi.getElementById('uiAdd') as HTMLButtonElement).addEventListener('click', () => {
      uiClicks += 1;
      const t = dUi.getElementById('uiTbl') as HTMLTableElement;
      const r = t.querySelector('tbody')!.insertRow();
      r.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
    });
    const pUi = emptyProfile();
    pUi.research.push({ title: '成果一', type: '论文', date: '2024-03', role: '1/1' });
    pUi.research.push({ title: '成果二', type: '论文', date: '2024-05', role: '2/3' });
    const nUi = await fillAchievements(pUi, dUi, 0, undefined, 3);
    check(nUi === 2 && uiClicks === 1, '扩展横幅不被误当加行按钮，真按钮正常加行');
  }

  // 回归：东华式嵌套布局——网格表嵌套在外层布局表里，真「新增一行」按钮在外层表 → 必须能找到并加行
  {
    const wNest2 = new JSDOM(
      '<body>' +
        '<table id="outer"><tbody><tr><td>' +
        '<table id="inner"><tbody><tr><th>时间（日期格式：2018-11）</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td><input name="in0t"></td><td><input name="in0j"></td><td><input name="in0n"></td><td><input name="in0r"></td></tr></tbody></table>' +
        '<button id="addNewRow">新增一行</button>' +
        '</td></tr></tbody></table>' +
        '<span class="tui-banner-title">🔄 正在自动添加</span>' +
        '</body>',
    );
    const dN2 = wNest2.window.document;
    wNest2.window.Element.prototype.getBoundingClientRect = rect as never;
    let nestClicks = 0;
    (dN2.getElementById('addNewRow') as HTMLButtonElement).addEventListener('click', () => {
      nestClicks += 1;
      const t = dN2.getElementById('inner') as HTMLTableElement;
      const r = t.querySelector('tbody')!.insertRow();
      r.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
    });
    const pN2 = emptyProfile();
    pN2.research.push({ title: '成果一', type: '论文', date: '2024-03', role: '1/1' });
    pN2.research.push({ title: '成果二', type: '论文', date: '2024-05', role: '2/3' });
    const nN2 = await fillAchievements(pN2, dN2, 0, undefined, 3);
    check(nN2 === 2 && nestClicks === 1, '嵌套布局表（祖先表）里的「新增一行」按钮被找到并加行');
  }

  // 东华式奖励情况表：网格表头只有「时间/地点/内容」，标题与外层包装表嵌套 → 识别、填写并自动加行
  {
    const wJl = new JSDOM(
      '<body>' +
        '<table id="jlOuter"><tbody><tr><td>何时何地何原因受过何种奖励（内容中不得含有符号）</td><td>时间（日期格式：2018-11） 地点 内容</td></tr>' +
        '<tr><td colspan="2">' +
        '<table id="jlTbl"><tbody><tr><th>时间（日期格式：2018-11）</th><th>地点</th><th>内容</th></tr>' +
        '<tr><td><input name="jl0t"></td><td><input name="jl0p"></td><td><input name="jl0n"></td><td><input type="button" value="删除"></td></tr>' +
        '<tr><td><input name="jl1t"></td><td><input name="jl1p"></td><td><input name="jl1n"></td><td><input type="button" value="删除"></td></tr></tbody></table>' +
        '<button id="addNewRow">新增一行</button>' +
        '</td></tr></tbody></table>' +
        '</body>',
    );
    const dJl = wJl.window.document;
    wJl.window.Element.prototype.getBoundingClientRect = rect as never;
    let jlClicks = 0;
    (dJl.getElementById('addNewRow') as HTMLButtonElement).addEventListener('click', () => {
      jlClicks += 1;
      const t = dJl.getElementById('jlTbl') as HTMLTableElement;
      const r = t.querySelector('tbody')!.insertRow();
      r.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input type="button" value="删除"></td>';
    });
    const pJl = emptyProfile();
    Object.assign(pJl.education, { university: '西安理工大学' });
    pJl.awards.push({ date: '2025-12', place: '西安理工大学', content: '尚真笃学先进个人', level: '校级' });
    pJl.awards.push({ date: '2024-03', place: '西安理工大学', content: '制图竞赛二等奖', level: '校级' });
    pJl.awards.push({ date: '2025-11', place: '西安理工大学', content: '传感器大赛三等奖', level: '省级' });
    const nJl = await fillAwardRows(pJl, dJl, 0, undefined, 3);
    const jl0n = dJl.querySelector('[name="jl0n"]') as HTMLInputElement;
    const jl0p = dJl.querySelector('[name="jl0p"]') as HTMLInputElement;
    check(nJl === 3, '东华式奖励表（表头仅时间/地点/内容）识别并填满 3 条');
    check(jl0n.value === '尚真笃学先进个人' && jl0p.value === '西安理工大学', '奖励名称/地点写入正确列');
    check(jlClicks === 1, '奖励表加行按钮（外层包装表）被点到一次');
    const jlHit = findAwardTable(dJl);
    check(!!jlHit && jlHit.table.id === 'jlTbl', '奖励外层包装表不被误选');
  }

  // 负例：无奖励关键词、无加删按钮的「时间+内容」列表不算奖励表
  {
    const wList = new JSDOM(
      '<body><table><tbody><tr><th>时间</th><th>内容</th></tr>' +
        '<tr><td><input name="ls0t"></td><td><input name="ls0n"></td></tr></tbody></table></body>',
    );
    const pL = emptyProfile();
    pL.awards.push({ date: '2024-01', place: '', content: '某奖' });
    const nL = await fillAwardRows(pL, wList.window.document, 0, undefined, 0);
    check(nL === 0, '无加删按钮的时间+内容列表不被误当奖励表');
  }

  // 苏大式奖励表：网格无加删按钮、无奖励关键词，标题只在外层表 → 通过标题表识别并填写
  {
    const wSd = new JSDOM(
      '<body>' +
        '<table id="jlOuter2"><tbody><tr><td>何时何地何原因受过何种奖励（内容中不得含有符号）</td><td>时间（日期格式：2018-11） 地点 内容</td></tr></tbody></table>' +
        '<table id="jlTbl2"><tbody><tr><th>时间（日期格式：2018-11）</th><th>地点</th><th>内容</th></tr>' +
        '<tr><td><input name="sd0t"></td><td><input name="sd0p"></td><td><input name="sd0n"></td></tr>' +
        '<tr><td><input name="sd1t"></td><td><input name="sd1p"></td><td><input name="sd1n"></td></tr></tbody></table>' +
        '</body>',
    );
    const dSd = wSd.window.document;
    wSd.window.Element.prototype.getBoundingClientRect = rect as never;
    const pSd = emptyProfile();
    pSd.awards.push({ date: '2025-12', place: '西安理工大学', content: '尚真笃学先进个人' });
    pSd.awards.push({ date: '2024-12', place: '西安理工大学', content: '竟赛奖金1250元' });
    const nSd = await fillAwardRows(pSd, dSd, 0, undefined, 0);
    const sd0n = dSd.querySelector('[name="sd0n"]') as HTMLInputElement;
    const sd1n = dSd.querySelector('[name="sd1n"]') as HTMLInputElement;
    const sd0t = dSd.querySelector('[name="sd0t"]') as HTMLInputElement;
    check(nSd === 2 && sd0n.value === '尚真笃学先进个人' && sd1n.value === '竟赛奖金1250元' && sd0t.value === '2025-12', '苏大式奖励表（无加删按钮，标题在外层表）识别并填写');
  }

  // 邮箱别名：「电子信箱」标签命中邮箱字段（中南大学式）
  {
    const wEm = new JSDOM(
      '<body><table><tbody><tr><td>*电子信箱</td><td><input name="txtdzxx"></td></tr></tbody></table></body>',
    );
    wEm.window.Element.prototype.getBoundingClientRect = rect as never;
    const pEm = emptyProfile();
    pEm.basic.email = 'xiabojing@example.com';
    fillAll(pEm, wEm.window.document);
    check(
      (wEm.window.document.querySelector('[name="txtdzxx"]') as HTMLInputElement).value === 'xiabojing@example.com',
      '「电子信箱」标签命中邮箱字段',
    );
  }

  // 海大式：外语水平单输入框 → 合成四六级摘要
  {
    const wCet = new JSDOM(
      '<body><table><tbody><tr><td>外语水平</td><td><input name="wysp2"></td></tr></tbody></table></body>',
    );
    wCet.window.Element.prototype.getBoundingClientRect = rect as never;
    const pCet = emptyProfile();
    Object.assign(pCet.education, { cet4: '457', cet6: '0' });
    fillAll(pCet, wCet.window.document);
    const wysp = wCet.window.document.querySelector('[name="wysp2"]') as HTMLInputElement;
    check(wysp.value === '大学英语四级（CET-4）457分', '「外语水平」单输入框合成四六级摘要');
  }

  // 海大式：单选组标签是"是否+服从调剂"两个片段 → 拼接后命中服从调剂并选中"是"
  {
    const wR = new JSDOM(
      '<body><form>' +
        '<div class="el-form-item"><span>是否</span><span>服从调剂</span>' +
        '<label class="el-radio"><input type="radio" name="g1" value="true"><span class="el-radio__label">是</span></label>' +
        '<label class="el-radio"><input type="radio" name="g1" value="false"><span class="el-radio__label">否</span></label></div>' +
        '</form></body>',
    );
    wR.window.Element.prototype.getBoundingClientRect = rect as never;
    const pR = emptyProfile();
    Object.assign(pR.education, { obeyAdjust: '是' });
    fillAll(pR, wR.window.document);
    const yesR = wR.window.document.querySelector('input[type="radio"][value="true"]') as HTMLInputElement;
    check(yesR.checked === true, '「是否」片段拼接成「是否服从调剂」并选中"是"');
  }

  // 回归：选择器关键字路径绝不向主表单输入框打字（海大"共青团员"打进姓名框事故）
  {
    const wPk = new JSDOM(
      '<body><div class="window"><span>请选择</span>' +
        '<input name="xm"><input name="pick1" class="el-select">' +
        '</div></body>',
    );
    wPk.window.Element.prototype.getBoundingClientRect = rect as never;
    const dPk = wPk.window.document;
    const xm = dPk.querySelector('[name="xm"]') as HTMLInputElement;
    const res = await pickInPage(dPk, dPk.querySelector('[name="pick1"]') as HTMLInputElement, '共青团员');
    check(res !== 'picked' && xm.value === '', '选择器失败时绝不向主表单输入框打字');
  }

  // 审查回归：半填行不被覆盖（时间格已有用户内容 → 不使用该行）
  {
    const wHalf = new JSDOM(
      '<body><table id="ht"><tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th></tr>' +
        '<tr><td><input name="hf0t" value="2022-09"></td><td><input name="hf0o"></td><td><input name="hf0r"></td></tr>' +
        '<tr><td><input name="hf1t"></td><td><input name="hf1o"></td><td><input name="hf1r"></td></tr></tbody></table></body>',
    );
    const dHalf = wHalf.window.document;
    wHalf.window.Element.prototype.getBoundingClientRect = rect as never;
    const pHalf = emptyProfile();
    pHalf.experiences.push({ start: '2020-09', end: '2023-06', org: '某高中', role: '学生' });
    const nHalf = await fillExperiences(pHalf, dHalf, 0, undefined, 0);
    const hf0t = dHalf.querySelector('[name="hf0t"]') as HTMLInputElement;
    const hf0o = dHalf.querySelector('[name="hf0o"]') as HTMLInputElement;
    const hf1o = dHalf.querySelector('[name="hf1o"]') as HTMLInputElement;
    check(nHalf === 1 && hf0t.value === '2022-09' && hf0o.value === '' && hf1o.value === '某高中', '半填行不被覆盖，写入另一空行');
  }

  // 审查回归：外语水平表已有内容不被覆盖、不重复添加
  {
    const wCet2 = new JSDOM(
      '<body><table><tbody><tr><th>外语水平名称</th><th>成绩</th><th>取得成绩时间</th></tr>' +
        '<tr><td><input name="c2n" value="大学英语六级（CET-6）"></td><td><input name="c2s" value="500"></td><td><input name="c2d"></td></tr>' +
        '<tr><td><input name="c3n"></td><td><input name="c3s"></td><td><input name="c3d"></td></tr></tbody></table></body>',
    );
    wCet2.window.Element.prototype.getBoundingClientRect = rect as never;
    const pCet2 = emptyProfile();
    Object.assign(pCet2.education, { cet4: '457', cet4Date: '2023-06', cet6: '500', cet6Date: '2025-06' });
    fillAll(pCet2, wCet2.window.document);
    const c2s = wCet2.window.document.querySelector('[name="c2s"]') as HTMLInputElement;
    const c3n = wCet2.window.document.querySelector('[name="c3n"]') as HTMLInputElement;
    check(c2s.value === '500', '外语水平表已有内容不被覆盖');
    check(c3n.value === '大学英语四级（CET-4）', '已有六级时四级写入空行（不重复添加六级行）');
  }

  // 北邮式逐行网格：填完一行自动点行内 DoPostback「添加」落库（标准回发 form.submit）
  {
    const w3 = new JSDOM(
      '<body><form>' +
        '<table><tbody><tr><th>学习起止时间</th><th>学习或工作单位名称</th><th>担任职务</th><th>操作</th></tr>' +
        '<tr><td><input name="bp0t"></td><td><input name="bp0o"></td><td><input name="bp0r"></td>' +
        '<td><a id="bp0add" href="javascript:WebForm_DoPostback(&quot;ctl00$contentParent$dgData1$ctl03$lbAddG&quot;,&quot;&quot;,null,false,true)">添加</a></td></tr></tbody></table>' +
        '</form></body>',
    );
    const d3 = w3.window.document;
    w3.window.Element.prototype.getBoundingClientRect = rect as never;
    let submits = 0;
    (w3.window.HTMLFormElement.prototype as unknown as { submit: () => void }).submit = () => {
      submits += 1;
    };
    const pBp = emptyProfile();
    pBp.experiences.push({ start: '2023-09', end: '2027-06', org: '西安理工大学', role: '学习委员' });
    const nBp = await fillExperiences(pBp, d3);
    const bp0o = d3.querySelector('[name="bp0o"]') as HTMLInputElement;
    check(nBp === 1 && bp0o.value === '西安理工大学', '北邮式逐行网格：填入经历行');
    check(submits === 1, '北邮式逐行网格：填完自动点行内 DoPostback「添加」落库（标准回发）');
  }

  // ASP.NET submit 型"添加一行"按钮识别
  const njExp = (w.document.querySelector('[name="nj0t"]') as HTMLInputElement).closest('table') as HTMLTableElement;
  njExp.remove();
  const tbl = w.document.createElement('table');
  tbl.innerHTML =
    '<tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th><th>操作</th></tr>' +
    '<tr><td><input name="sub0t"></td><td><input name="sub0d"></td><td><input name="sub0z"></td>' +
    '<td><input type="submit" value="添加一行" onclick="expAddRow(this)"></td></tr></tbody>';
  w.document.body.appendChild(tbl);
  const pS = emptyProfile();
  pS.experiences.push({ start: '2016-09', end: '2019-06', org: '某初中', role: '学生' });
  pS.experiences.push({ start: '2019-09', end: '2022-06', org: '某高中', role: '学生' });
  const nS = await fillExperiences(pS, w.document, 0, undefined, 2);
  check(nS === 2, 'submit 型"添加一行"按钮识别并自动加行');

  // 重复保护：页面已有条目时不重复填入、不重复加行
  const rowsBefore = tbl.rows.length;
  const nS2 = await fillExperiences(pS, w.document, 0, undefined, 2);
  check(nS2 === 0, '页面已有条目时不再重复填写');
  check(tbl.rows.length === rowsBefore, '页面已有条目时不再重复加行');

  // EasyUI 无文字图标型"新增"按钮（icon-search）
  tbl.remove();
  const tbl2 = w.document.createElement('table');
  tbl2.innerHTML =
    '<tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th><th>操作</th></tr>' +
    '<tr><td><input name="ic0t"></td><td><input name="ic0d"></td><td><input name="ic0z"></td>' +
    '<td><a href="javascript:void(0)" onclick="expAddRow(this)"><span class="l-btn-empty icon-search"></span></a></td></tr></tbody>';
  w.document.body.appendChild(tbl2);
  const pI = emptyProfile();
  pI.experiences.push({ start: '2013-09', end: '2016-06', org: '某小学', role: '学生' });
  pI.experiences.push({ start: '2016-09', end: '2019-06', org: '某中学', role: '学生' });
  const nI = await fillExperiences(pI, w.document, 0, undefined, 2);
  check(nI === 2, '无文字图标型"新增"按钮识别并自动加行');

  // click-to-edit 模板行：点击空单元格才出现输入框
  tbl2.remove();
  const tbl3 = w.document.createElement('table');
  tbl3.innerHTML =
    '<tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th></tr>' +
    '<tr><td onclick="tuiAct(this)"></td><td onclick="tuiAct(this)"></td><td onclick="tuiAct(this)"></td></tr></tbody>';
  w.document.body.appendChild(tbl3);
  const pT = emptyProfile();
  pT.experiences.push({ start: '2022-09', end: '2026-06', org: '西安理工大学', role: '学生' });
  const nT = await fillExperiences(pT, w.document, 0, undefined, 3);
  check(nT === 1, '点击空白模板行激活编辑并填写');

  // 南理工式：点击「保存」后服务器才多出一行
  tbl3.remove();
  const tbl4 = w.document.createElement('table');
  tbl4.id = 'svTable';
  tbl4.innerHTML =
    '<tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th></tr>' +
    '<tr><td><input name="sv0t"></td><td><input name="sv0d"></td><td><input name="sv0z"></td></tr></tbody>';
  w.document.body.appendChild(tbl4);
  const saveBtn = w.document.createElement('button');
  saveBtn.textContent = '保存';
  saveBtn.onclick = () => {
    const t = w.document.getElementById('svTable') as HTMLTableElement;
    const r = t.querySelector('tbody')!.insertRow();
    for (let i = 0; i < 3; i++) {
      const td = r.insertCell();
      td.innerHTML = '<input>';
    }
  };
  w.document.body.appendChild(saveBtn);
  const pV = emptyProfile();
  pV.experiences.push({ start: '2020-09', end: '2023-06', org: '某高中', role: '学生' });
  pV.experiences.push({ start: '2023-09', end: '2027-06', org: '某大学', role: '学生' });
  const nV = await fillExperiences(pV, w.document, 0, undefined, 4);
  check(nV === 2, '「保存后多一行」流程自动填写 2 条');

  // 已有旧格式时间格（如 2020年9月 至 2023年6月）的经历行：仅归一化时间格式，不重复新增
  const sv2 = w.document.getElementById('svTable');
  if (sv2) sv2.remove();
  const tbl5 = w.document.createElement('table');
  tbl5.innerHTML =
    '<tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th></tr>' +
    '<tr><td><input name="nm0t"></td><td><input name="nm0o"></td><td><input name="nm0r"></td></tr>' +
    '<tr><td><input name="nm1t"></td><td><input name="nm1o"></td><td><input name="nm1r"></td></tr></tbody>';
  w.document.body.appendChild(tbl5);
  const nmVal = (n: string) => (w.document.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
  (w.document.querySelector('[name="nm0t"]') as HTMLInputElement).value = '2020年9月 至 2023年6月';
  (w.document.querySelector('[name="nm0o"]') as HTMLInputElement).value = '某高中';
  const pN = emptyProfile();
  pN.experiences.push({ start: '2020-09', end: '2023-06', org: '某高中', role: '学生' });
  pN.experiences.push({ start: '2023-09', end: '2027-06', org: '某大学', role: '学生' });
  const nN = await fillExperiences(pN, w.document, 0, undefined, 0);
  check(nmVal('nm0t') === '2020.09-2023.06', '已存在经历行仅归一化时间格式（旧长格式→YYYY.MM-YYYY.MM）');
  check(nN === 1, '已存在经历行不重复计入新增（仅第二条空行计 1 条）');
  check(nmVal('nm1o') === '某大学' && nmVal('nm1t') === '2023.09-2027.06', '第二条经历仍正常填入空行');
  check(tbl5.rows.length === 3, '归一化过程中不额外加行');

  // 服务器展示行（纯文本、无输入框）识别为"已存在"，不重复填入插入行
  tbl5.remove();
  const tbl6 = w.document.createElement('table');
  tbl6.innerHTML =
    '<tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th></tr>' +
    '<tr><td>2020年9月 至 2023年6月</td><td>西安市第七十五中学</td><td>劳动委员</td></tr>' +
    '<tr><td><input name="tx6t"></td><td><input name="tx6o"></td><td><input name="tx6r"></td></tr></tbody>';
  w.document.body.appendChild(tbl6);
  const pX = emptyProfile();
  pX.experiences.push({ start: '2020-09', end: '2023-06', org: '西安市第七十五中学', role: '劳动委员' });
  pX.experiences.push({ start: '2023-09', end: '2027-06', org: '某大学', role: '学生' });
  const nX = await fillExperiences(pX, w.document, 0, undefined, 0);
  check(nX === 1, '服务器文本展示行识别为已存在，不重复填入（仅新增 1 条）');
  check(
    (w.document.querySelector('[name="tx6o"]') as HTMLInputElement).value === '某大学' &&
      (w.document.querySelector('[name="tx6t"]') as HTMLInputElement).value === '2023.09-2027.06',
    '插入行填入第二条经历（紧凑时间格式）',
  );
  check(tbl6.rows.length === 3, '文本展示行存在时不额外加行');

  // 学术成果表同样支持文本展示行识别（先移除 fixture 中所有匹配的成果表，避免误命中）
  (Array.from(w.document.querySelectorAll('table')) as HTMLTableElement[]).forEach((t) => {
    const h = Array.from(t.rows[0] ? t.rows[0].cells : []).map((c) => (c.textContent || '').trim());
    if (h.some((x) => x.includes('成果名称') || x.includes('标题')) && h.some((x) => /时间|日期/.test(x))) t.remove();
  });
  const tbl7 = w.document.createElement('table');
  tbl7.innerHTML =
    '<tbody><tr><th>成果名称</th><th>取得时间</th><th>作者排名</th></tr>' +
    '<tr><td>成果C</td><td>2024-03</td><td>1/3</td></tr>' +
    '<tr><td><input name="ac0n"></td><td><input name="ac0t"></td><td><input name="ac0r"></td></tr></tbody>';
  w.document.body.appendChild(tbl7);
  const pY = emptyProfile();
  pY.research.push({ title: '成果C', type: '论文', date: '2024-03', role: '1/3' });
  pY.research.push({ title: '成果D', type: '论文', date: '2024-05', role: '2/4' });
  const nY = await fillAchievements(pY, w.document, 0, undefined, 0);
  check(nY === 1, '学术成果文本展示行识别为已存在（仅新增 1 条）');
  check((w.document.querySelector('[name="ac0n"]') as HTMLInputElement).value === '成果D', '成果插入行填入第二条成果');

  // 长字段保守截断 + 填写快照（保存失败清空页面后仍能还原"保存前"的值）
  const pZ = emptyProfile();
  pZ.basic.name = '测试';
  pZ.basic.phone = '13800138000';
  pZ.basic.address = 'X'.repeat(60);
  fillAll(pZ, w.document);
  const addrV = byName('txdz');
  check(addrV.length === 50, '超长通讯地址保守截断到 50 字符');
  const snapRaw = w.sessionStorage.getItem('tui-fill-snapshot');
  const snap = snapRaw ? JSON.parse(snapRaw) : null;
  check(
    !!snap && Array.isArray(snap.fields) && snap.fields.some((f: any) => f.name === 'txdz' && f.value === addrV),
    '填充快照写入 sessionStorage（保存失败后可还原保存前值）',
  );
  const sumRaw = w.sessionStorage.getItem('tui-fill-summary');
  const sum = sumRaw ? JSON.parse(sumRaw) : null;
  check(
    !!sum && Array.isArray(sum.items) && sum.items.some((i: any) => i.field === 'basic.name' && i.status === 'filled') && sum.items.some((i: any) => i.field === 'basic.namePinyin' && i.status === 'profileEmpty'),
    '填充结果摘要写入 sessionStorage（含逐字段状态，供诊断"消失"字段用）',
  );

  // 奖励名称"学校·奖项"前缀拆分（反向提取把单位并进名称的场景）
  const tbl8 = w.document.createElement('table');
  tbl8.innerHTML =
    '<tbody><tr><th>时 间</th><th>奖励单位</th><th>奖励原因</th><th>奖励名称</th></tr>' +
    '<tr><td><input name="aw0t"></td><td><input name="aw0u"></td><td><input name="aw0c"></td><td><input name="aw0n"></td></tr>' +
    '<tr><td><input name="aw1t"></td><td><input name="aw1u"></td><td><input name="aw1c"></td><td><input name="aw1n"></td></tr></tbody>';
  w.document.body.appendChild(tbl8);
  const pW = emptyProfile();
  pW.basic.name = '测试';
  pW.education.university = '西安理工大学';
  pW.awards.push({ date: '2024-11', place: '西安理工大学', content: '优秀学生干部', level: '校级' });
  pW.awards.push({ date: '2025-03', place: '西安理工大学', content: '优秀学生干部', level: '校级' }); // 同内容不同时间 → 两条记录
  const resW = fillAll(pW, w.document);
  check(byName('aw0n') === '优秀学生干部' && byName('aw0u') === '西安理工大学', '奖励情况按时间/地点/内容填写（名称/地点各归其位）');
  check(byName('aw0t') === '2024-11' && byName('aw1n') === '优秀学生干部' && byName('aw1t') === '2025-03', '同内容不同获奖时间的奖项各占一行，不合并');
  check(!resW.items.some((i) => i.field === 'awards[dup]'), '同内容不同时间不提示重复');
  // 真正重复（同内容+同时间）→ 合并提示
  const pW2 = emptyProfile();
  pW2.basic.name = '测试';
  pW2.education.university = '西安理工大学';
  pW2.awards.push({ date: '2024-06', place: '西安理工大学', content: '测试奖' });
  pW2.awards.push({ date: '2024-06', place: '西安理工大学', content: '测试奖' });
  const resW2 = fillAll(pW2, w.document);
  check(resW2.items.some((i) => i.field === 'awards[dup]' && i.status === 'skipped'), '档案奖项内容+时间完全相同才合并并在结果中提示');
  tbl8.remove();

  // 家庭成员：文本展示行识别 + 去重 + 空行填充（先移除 fixture 家庭表避免误命中）
  (['f0x', 'f1x'] as const).forEach((n) => {
    const el = w.document.querySelector(`[name="${n}"]`) as HTMLInputElement | null;
    const t = el ? el.closest('table') : null;
    if (t) t.remove();
  });
  const tbl9 = w.document.createElement('table');
  tbl9.innerHTML =
    '<tbody><tr><th>成员姓名</th><th>与本人关系</th><th>工作单位名称及职务</th><th>联系电话</th></tr>' +
    '<tr><td>张父</td><td>父亲</td><td>某公司</td><td>13811112222</td></tr>' +
    '<tr><td><input name="fm0n"></td><td><input name="fm0r"></td><td><input name="fm0o"></td><td><input name="fm0p"></td></tr></tbody>';
  w.document.body.appendChild(tbl9);
  const pF = emptyProfile();
  pF.familyMembers.push({ name: '张父', relation: '父亲', org: '某公司', phone: '13811112222', politicalStatus: '群众' });
  pF.familyMembers.push({ name: '张母', relation: '母亲', org: '某单位', phone: '13833334444', politicalStatus: '群众' });
  const nF = await fillFamilyMembers(pF, w.document, 0, undefined, 0);
  check(nF === 1 && (w.document.querySelector('[name="fm0n"]') as HTMLInputElement).value === '张母', '家庭成员：文本展示行去重，仅空行填第二条');
  const nF2 = await fillFamilyMembers(pF, w.document, 0, undefined, 0);
  check(nF2 === 0, '家庭成员：再次填充不重复（去重保护）');
  tbl9.remove();

  // 空白模板行（仅图标按钮、无输入框）不算可填空行 → 成员填入真正的插入行
  const tbl9b = w.document.createElement('table');
  tbl9b.innerHTML =
    '<tbody><tr><th>成员姓名</th><th>关 系</th><th>工作单位名称及职务</th><th>联系电话</th></tr>' +
    '<tr><td></td><td></td><td></td><td><input type="image"></td></tr>' +
    '<tr><td><input name="fb0n"></td><td><input name="fb0r"></td><td><input name="fb0o"></td><td><input name="fb0p"></td></tr></tbody>';
  w.document.body.appendChild(tbl9b);
  const pB = emptyProfile();
  pB.familyMembers.push({ name: '张父', relation: '父亲', org: '某公司', phone: '13811112222', politicalStatus: '' });
  const nB = await fillFamilyMembers(pB, w.document, 0, undefined, 0);
  check(nB === 1 && (w.document.querySelector('[name="fb0n"]') as HTMLInputElement).value === '张父', '空白模板行（仅图标按钮）不算空行，成员填入真正的插入行');
  tbl9b.remove();

  // 本人姓名误入家庭成员行（通用字段漏进网格）→ 自动清空并填入正确成员
  const tbl10 = w.document.createElement('table');
  tbl10.innerHTML =
    '<tbody><tr><th>成员姓名</th><th>关 系</th><th>工作单位名称及职务</th><th>联系电话</th></tr>' +
    '<tr><td><input name="sn0x"></td><td><input name="sn0g"></td><td><input name="sn0d"></td><td><input name="sn0p"></td></tr></tbody>';
  w.document.body.appendChild(tbl10);
  (w.document.querySelector('[name="sn0x"]') as HTMLInputElement).value = '张三';
  (w.document.querySelector('[name="sn0g"]') as HTMLInputElement).value = '父子';
  (w.document.querySelector('[name="sn0d"]') as HTMLInputElement).value = '软件工程';
  (w.document.querySelector('[name="sn0p"]') as HTMLInputElement).value = '13800000000';
  fillAll(profile, w.document);
  check((w.document.querySelector('[name="sn0x"]') as HTMLInputElement).value === '张父', '本人姓名误入家庭成员行 → 自动清空并填入正确成员');
  tbl10.remove();

  // ===== 行政区划数据工具（地区树/查询窗口关键字） =====
  const r1 = splitRegion('陕西省西安市未央区');
  check(r1 !== null && r1.province === '陕西省' && r1.city === '西安市' && r1.district === '未央区', '地区拆分：省/市/区（带后缀）');
  const r2 = splitRegion('陕西西安未央区');
  check(r2 !== null && r2.city === '西安市', '地区拆分：省/市不带后缀也能识别');
  const r3 = splitRegion('北京市海淀区');
  check(r3 !== null && r3.province === '北京市' && r3.city === '市辖区' && r3.district === '海淀区', '地区拆分：直辖市（市=市辖区）');
  check(isRegionLike('陕西省西安市未央区') === true && isRegionLike('西安理工大学') === false, '地区类值识别（地址 vs 学校名）');
  const kw = regionKeywords('陕西省西安市未央区');
  check(kw.length >= 2 && kw.indexOf('西安市') >= 0 && kw.indexOf('未央区') >= 0, '地区查询关键字阶梯（市/区短关键字）');
  const tt = regionTreeTokens('陕西省西安市未央区');
  check(tt.length === 3 && tt[0] === '陕西省' && tt[1] === '西安市' && tt[2] === '未央区', '地区树形点选 tokens（省→市→区）');
  check(regionCode6('陕西省西安市未央区') === '610112', '6 位区划码：陕西省西安市未央区 → 610112');
  check(regionCode6('陕西省西安市新城区') === '610102', '6 位区划码：陕西省西安市新城区 → 610102');
  check(regionNameFromCode('610102') === '陕西省西安市新城区', '区划码反查：610102 → 陕西省西安市新城区');
  check(regionFromIdCard({ basic: { idCard: '610102200305011233' } }) === '陕西省西安市新城区', '身份证前 6 位推导地区（610102 → 新城区）');

  // ===== 遗留弹窗清理 =====
  {
    const layerClose = w.document.createElement('span');
    layerClose.className = 'layui-layer-close';
    layerClose.setAttribute('onclick', "this.setAttribute('data-hit','1')");
    w.document.body.appendChild(layerClose);
    closeLeftoverPickers(w.document);
    check(layerClose.getAttribute('data-hit') === '1', '遗留弹窗清理：点击 layui-layer-close 关闭按钮');
    layerClose.remove();
  }

  // ===== 地区三联直写（东华式 dm/名称/显示 三联免弹窗） =====
  {
    const cell = w.document.createElement('div');
    cell.innerHTML =
      '<input type="hidden" name="hkszdm">' +
      '<input type="hidden" name="hkszd">' +
      '<input type="text" name="hkszdmc">' +
      '<span class="addon">选择</span>';
    w.document.body.appendChild(cell);
    const dmEl = cell.querySelector('[name="hkszdm"]') as HTMLInputElement;
    const zdEl = cell.querySelector('[name="hkszd"]') as HTMLInputElement;
    const mcEl = cell.querySelector('[name="hkszdmc"]') as HTMLInputElement;
    const mk = (el: Element): { label: string; field: string | null; status: 'picker'; valuePreview: string; el: Element } => ({
      label: '户口所在地*',
      field: 'basic.hukou',
      status: 'picker',
      valuePreview: '陕西省西安市未央区',
      el,
    });
    const items: FillItem[] = [mk(dmEl), mk(zdEl), mk(mcEl)];
    const nDirect = directFillRegionTriplets(w.document, items);
    check(nDirect === 1, '地区三联直写：处理 1 组');
    check(dmEl.value === '610112' && zdEl.value === '陕西省西安市未央区' && mcEl.value === '陕西省西安市未央区', '地区三联直写：码+名称+显示框全部写入');
    check(items.every((i) => i.status === 'filled'), '地区三联直写：同组条目标记为已填（跳过弹窗）');
    cell.remove();
  }

  // ===== 长文同义词 / 人工长文规则 / 编码值字典（吸收巨能填） =====
  {
    const wrap2 = w.document.createElement('div');
    wrap2.innerHTML =
      '<label>参加科研工作、课外科技活动情况</label><textarea name="kygz"></textarea>' +
      '<label>个人陈述</label><textarea name="grcs"></textarea>' +
      '<label>婚否</label><select name="hfs"><option value="0">--请选择--</option><option value="1">1</option><option value="2">2</option></select>' +
      '<label>政治面貌</label><select name="zzs"><option value="">--</option><option value="13">13</option><option value="03">03</option></select>';
    w.document.body.appendChild(wrap2);
    const resE = fillAll(profile, w.document);
    const kygz = w.document.querySelector('[name="kygz"]') as HTMLTextAreaElement;
    const grcs = w.document.querySelector('[name="grcs"]') as HTMLTextAreaElement;
    check(kygz.value.length > 0 && resE.items.some((i) => i.el === kygz && i.status === 'filled'), '长文同义词：参加科研工作 → compose.research 自动合成');
    check(grcs.value === '', '人工长文：个人陈述不自动填写');
    check(resE.items.some((i) => i.el === grcs && i.status === 'skipped' && (i.reason || '').includes('人工撰写')), '人工长文：个人陈述标记跳过并提示人工撰写');
    check((w.document.querySelector('[name="hfs"]') as HTMLSelectElement).value === '1', '编码值字典：婚否纯码选项按码值 1 选中未婚');
    check((w.document.querySelector('[name="zzs"]') as HTMLSelectElement).value === '03', '编码值字典：政治面貌纯码选项按码值 03 选中团员');
    wrap2.remove();
  }

  // ===== 学校目录数据 =====
  const buptS = SCHOOLS.find((s) => s.name === '北京邮电大学');
  const njustS = SCHOOLS.find((s) => s.name === '南京理工大学');
  check(SCHOOLS.length >= 80, '学校目录：收录 80+ 所高校');
  check(!!buptS && buptS.entry === 'https://yzfs.bupt.edu.cn/MasterTm/Signin.aspx' && buptS.adapter === 'bupt', '学校目录：北邮入口 + 已适配标记');
  check(!!njustS && njustS.host === '202.119.85.163' && njustS.adapter === 'njust', '学校目录：南理工入口 + 已适配标记');
  check(SCHOOLS.every((s) => s.name && s.host && /^https?:/.test(s.entry)), '学校目录：条目字段完整（名称/域名/入口网址）');

  if (failedCount > 0) {
    console.error(`\n${failedCount} 项断言失败`);
    process.exit(1);
  } else {
    console.log('\n最终：全部断言通过 ✅');
  }
})();

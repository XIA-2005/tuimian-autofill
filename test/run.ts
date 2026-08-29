// 本地冒烟测试：用 jsdom 加载模拟报名表，验证匹配与填充逻辑。
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { canLockProfileRow, createRowState, emptyProfile, moveAtomicRow, normalizeProfile, setProfileCode, writeProfileValue } from '../src/core/profile';
import { closeLeftoverPickers, clearPageFill, directFillRegionTriplets, fillAchievements, fillAll, fillAwardRows, fillExperiences, fillFamilyMembers, fillLanguageExams, FillItem, findAchievementTable, findAwardTable, findExperienceTable, findPickerOption, pickInPage, sleep, trySetSelect } from '../src/core/filler';
import { scanSite } from '../src/core/scanner';
import { importFromPage } from '../src/core/importer';
import { findPickerTrigger, probeComponentDropdowns } from '../src/core/matcher';
import { generateTestProfile } from '../src/core/testdata';
import { isValidIdCard, runPreSubmitCheck } from '../src/core/checker';
import { ADAPTERS, allAdapters, declarativeMatchUrl } from '../src/core/adapters';
import { isRegionLike, regionCode6, regionFromIdCard, regionKeywords, regionMatchTokens, regionNameFromCode, regionTreeTokens, splitRegion } from '../src/core/regionutil';
import { SCHOOLS } from '../src/core/schools';
import { matchAdapterPackage, matchAdapterPage, SCHOOL_ADAPTER_PACKAGES, validateAdapterPackage } from '../src/core/adapter-packages';
import { SCHOOLS_WITH_PROGRAMS } from '../src/core/school-programs';
import { projectProfile } from '../src/core/projection';
import { addSnapshot, applicationChoicesFromPage, commitCrawlMerge, createCrawlSession, previewCrawlMerge, rememberApplicationChoice } from '../src/core/crawl';
import { fillAdapterContract } from '../src/core/control-drivers';
import { validateRemoteRules } from '../src/core/rulesync';
import { fillDateControl, fillDateControlAsync } from '../src/core/date-drivers';
import { resolveCodeNameBinding, verifyCodeNameBinding } from '../src/core/popup-binding';
import { pickComponentOption } from '../src/core/component-select-drivers';
import { pickSchool } from '../src/core/school-picker-driver';
import { pickMajor } from '../src/core/major-picker-driver';
import { decideRowJobRound, nextRowJobIndex, ROW_JOB_FAIL_CAP } from '../src/core/row-job-progress';
import { applyFillTelemetryCounts, createFillTelemetryState, redactTelemetryText, reduceFillTelemetry, restoreFillTelemetryState, safeTelemetryLabel } from '../src/core/fill-telemetry';
import { installMainWorldBridge } from '../src/world/main-world';
import { mainWorldJqueryClick, mainWorldJqxSelectLabel, mainWorldReady, mainWorldVueModelWrite, requestMainWorld } from '../src/core/world-bridge';
import { isLockedControl, withUnlocked } from '../src/core/unlock';
import { detectFakeSave, snapshotTableEvidence } from '../src/core/save-guard';
import { handleDialogAfterClick, visibleDialogRoots } from '../src/core/filler';
import { applyRicherRows, blobLooksLike, encodeBlobRows, parseBlobRows, readStashedTableRows, scoreRows, syncTableBlobs } from '../src/core/hidden-blob';
import { formatIssue, issueMeta } from '../src/core/error-codes';

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

// 统一填写遥测：真实计数、脱敏、动态行安全标签和跨回发恢复。
let telemetry = createFillTelemetryState(1_000);
telemetry = reduceFillTelemetry(telemetry, { stage: 'filling', level: 'success', action: '已填写并回读通过', targetLabel: '手机号 13812345678', field: 'basic.phone', timestamp: 1_100 });
telemetry = applyFillTelemetryCounts(telemetry, { total: 4, filled: 2, skipped: 1, failed: 0, waiting: 1 });
check(telemetry.progress.current === 3 && telemetry.progress.total === 4, '填写遥测使用真实完成数而非估算百分比');
check(!JSON.stringify(telemetry).includes('13812345678'), '填写遥测自动脱敏手机号');
check(safeTelemetryLabel('奖励情况 1：真实奖项名称', 'awards[0]') === '奖励情况 · 第 1 行', '动态表格日志不记录真实内容');
check(redactTelemetryText('邮箱 zhangsan@example.com') === '邮箱 [已脱敏]', '填写遥测自动脱敏邮箱');
const storedTelemetry = { ...telemetry, updatedAt: 1_100 };
check(restoreFillTelemetryState(JSON.stringify(storedTelemetry), 2_000)?.runId === telemetry.runId, '填写遥测可在页面回发后恢复');
check(restoreFillTelemetryState(JSON.stringify(storedTelemetry), 31 * 60_000) === null, '过期填写遥测不会恢复幽灵忙碌状态');

// ===== V2 档案、锁定、投影、适配包与爬取合并 =====
{
  const v1 = normalizeProfile({
    version: 1,
    basic: { name: '迁移测试' },
    education: {},
    research: [
      { title: '联邦学习论文', type: '论文', date: '2025-03', role: '一作' },
      { title: '创新训练项目', type: '科研项目', date: '2024-05', role: '负责人' },
      { title: '类型未知记录', type: '其他', date: '2024-01', role: '成员' },
    ],
  });
  check(v1.academicPapers.length === 1 && v1.academicProjects.length === 1, 'V1→V2：类型明确记录进入论文/项目原子表');
  check(v1.pendingClassifications.length === 1 && v1.migration.confirmed === false && !!v1.migration.v1Backup, 'V1→V2：不明确记录进入待分类并保留旧档案备份');

  const lockedProfile = emptyProfile();
  const manual = writeProfileValue(lockedProfile, 'basic.name', '手工值', 'manual');
  const crawlOverwrite = writeProfileValue(lockedProfile, 'basic.name', '爬取值', 'crawl', 'demo', 'basic');
  check(manual.ok && lockedProfile.fieldStates['basic.name'].locked, '锁定：手工修改自动锁定标量字段');
  check(!crawlOverwrite.ok && crawlOverwrite.conflict && lockedProfile.basic.name === '手工值', '锁定：爬取不得覆盖已锁字段');
  const rankProfile = emptyProfile();
  writeProfileValue(rankProfile, 'education.rank', '3', 'manual');
  check(!rankProfile.fieldStates['education.rank'].locked, '字段组锁定：排名未填写总人数时暂不锁定');
  writeProfileValue(rankProfile, 'education.rankBase', '120', 'manual');
  check(rankProfile.fieldStates['education.rank'].locked && rankProfile.fieldStates['education.rankBase'].locked, '字段组锁定：排名与总人数共同锁定');
  check(!canLockProfileRow({ title: '日期错误', end: '2025-02-31' }), '锁定校验：非法日期不能锁定');

  const projectionSource = emptyProfile();
  projectionSource.academicPapers.push({ kind: '论文', start: '', end: '2025-01', title: '论文 A', source: '期刊', role: '一作', authors: '', itemType: '', level: '', status: '', summary: '', advisor: '', partition: '', state: createRowState('manual', 'paper-a') });
  projectionSource.academicCompetitions.push({ kind: '创新创业', time: '2024-01', name: '竞赛 A', issuer: '组委会', place: '', level: '国家级', grade: '一等奖', rank: '1/3', content: '', state: createRowState('manual', 'competition-a') });
  projectionSource.honorsScholarships.push({ kind: '奖学金', time: '2024-09', name: '奖学金 A', issuer: '学校', place: '', level: '校级', grade: '一等奖', rank: '', content: '', state: createRowState('manual', 'honor-a') });
  const blueProjection = projectProfile(projectionSource, 'blue');
  check(blueProjection.profile.research.length === 2 && blueProjection.profile.awards.length === 1, '八表投影：蓝色系统竞赛进学术成果、奖学金进奖励情况');
  const hitProjection = projectProfile(projectionSource, 'hit');
  check(hitProjection.profile.research.length === 1 && hitProjection.profile.awards.length === 2, '八表投影：哈工大竞赛与荣誉进入获奖路由');
  projectionSource.academicPapers[0].state!.locked = false;
  check(moveAtomicRow(projectionSource, 'academicPapers', 0, 'academicPatents') && projectionSource.academicPatents[0].title === '论文 A', '原子表路由纠正：解锁后可人工移动并保留核心字段');

  check(!!matchAdapterPackage('https://yjszs.lzu.edu.cn/lzuyjsytms/info/edit')?.id.includes('lzu'), '适配包：识别兰州大学专项路径');
  check(matchAdapterPackage('https://yjsy.ustb.edu.cn/ksxt/ssxly/example')?.id === 'ustb-blue-xly', '适配包：北科大夏令营优先命中蓝色三联专项契约');
  const ustbPackage = matchAdapterPackage('https://yjsy.ustb.edu.cn/ksxt/ssxly/example')!;
  check(ustbPackage.commitPolicy === 'validated-next-only' && !!ustbPackage.pages[0].nextSelectors?.length, '连续填写：北科大只开放经过验收的自动下一步契约');
  const ustbLanguageDom = new JSDOM('<select id="lbmc0"></select><input id="cj0"><input id="sj0">', { url: 'https://yjsy.ustb.edu.cn/ksxt/ssxly/token' });
  check(matchAdapterPage(ustbPackage, ustbLanguageDom.window.document, ustbLanguageDom.window.location.href).page?.id === 'language', '北科大适配包：独立识别外语水平选项页');
  const ustbAchievementDom = new JSDOM('<table><tr><th>学术成果</th></tr></table><button id="addNewRow" class="button bg-sub">新增一行</button><button class="button bg-sub">下一步</button>', { url: 'https://yjsy.ustb.edu.cn/ksxt/ssxly/token' });
  check(matchAdapterPage(ustbPackage, ustbAchievementDom.window.document, ustbAchievementDom.window.location.href).page?.id === 'safe-form-step', '北科大适配包：学术成果等加密 URL 步骤进入安全连续填写契约');
  const ustbUploadDom = new JSDOM('<input type="file"><button class="button bg-sub">下一步</button>', { url: 'https://yjsy.ustb.edu.cn/ksxt/ssxly/token' });
  check(matchAdapterPage(ustbPackage, ustbUploadDom.window.document, ustbUploadDom.window.location.href).allowed === false, '北科大适配包：上传步骤禁止自动下一步');
  const hfutPackage = matchAdapterPackage('https://yzbm.hfut.edu.cn/sstm/encrypted-token')!;
  check(hfutPackage?.id === 'hfut-blue-tm' && hfutPackage.commitPolicy === 'validated-next-only', '合工大适配包：加密 /sstm/ 路径启用校验后自动下一步');
  const hfutBasicDom = new JSDOM('<input id="xm"><input id="xmpy"><select id="mz"></select><a class="button bg-sub">显示敏感信息</a><button class="button bg-sub">下一步</button>', { url: 'https://yzbm.hfut.edu.cn/sstm/encrypted-token' });
  hfutBasicDom.window.Element.prototype.getBoundingClientRect = rect as never;
  const hfutBasicPage = matchAdapterPage(hfutPackage, hfutBasicDom.window.document, hfutBasicDom.window.location.href).page;
  check(hfutBasicPage?.id === 'basic', '合工大适配包：基本信息页按稳定字段组合识别');
  const hfutEducationDom = new JSDOM(
    '<input id="bydwm" type="hidden"><input id="bydw" type="hidden"><input id="bkbydwShow"><span class="addon">选择</span>' +
    '<input id="byzydm" type="hidden"><input id="byzymc" type="hidden"><input id="bkbyzyShow"><span class="addon">选择</span>' +
    '<input id="rxny"><input id="byny"><button class="button bg-sub">下一步</button>',
    { url: 'https://yzbm.hfut.edu.cn/sstm/encrypted-education-step' },
  );
  const hfutEducationPage = matchAdapterPage(hfutPackage, hfutEducationDom.window.document, hfutEducationDom.window.location.href).page;
  const hfutContractItems = fillAdapterContract(profile, hfutEducationDom.window.document, hfutEducationDom.window.location.href, hfutPackage);
  const hfutSchoolContract = hfutContractItems.find((item) => item.profilePath === 'education.university');
  const hfutMajorContract = hfutContractItems.find((item) => item.profilePath === 'education.major');
  check(hfutEducationPage?.id === 'education', '合工大适配包：学习信息页优先命中院校/专业专项契约');
  check(!!(hfutSchoolContract?.pickerContext?.pickerProtocol === 'blue-flat' && hfutSchoolContract.pickerContext.codeSelectors?.includes('#bydwm')), '合工大本科院校：绑定 bydwm/bydw/bkbydwShow 三联字段');
  check(!!(hfutMajorContract?.pickerContext?.pickerProtocol === 'blue-flat' && hfutMajorContract.pickerContext.codeSelectors?.includes('#byzydm')), '合工大本科专业：绑定 byzydm/byzymc/bkbyzyShow 三联字段并与院校隔离');
  const hfutUploadDom = new JSDOM('<input type="file"><button class="button bg-sub">下一步</button>', { url: 'https://yzbm.hfut.edu.cn/sstm/upload-token' });
  check(matchAdapterPage(hfutPackage, hfutUploadDom.window.document, hfutUploadDom.window.location.href).allowed === false, '合工大连续填写：上传照片和上传材料页禁止自动下一步');
  const hfutSubmitDom = new JSDOM('<button class="button bg-sub">确认提交</button>', { url: 'https://yzbm.hfut.edu.cn/sstm/submit-token' });
  hfutSubmitDom.window.Element.prototype.getBoundingClientRect = rect as never;
  const hfutSubmitPage = matchAdapterPage(hfutPackage, hfutSubmitDom.window.document, hfutSubmitDom.window.location.href).page!;
  check(nextRowJobIndex(0, 3) === 3 && nextRowJobIndex(3, 3) === 6, '动态表格进度：按本轮起点累计，新增行断点不得造成双重加法');
  check(nextRowJobIndex(0, 5, 13) === 13, '动态表格进度：页面已有行的完成证据能够推进断点');
  check(matchAdapterPackage('https://zhaosheng.eol.cn/99999/user/apply')?.id !== 'shmtu-sszs', '适配包：上海海事大学严格隔离 /10254/');
  check(declarativeMatchUrl({ hosts: ['*.example.edu.cn'], pathPatterns: ['*/apply*'] }, 'https://yz.example.edu.cn/user/apply?id=1'), '声明式 URL 匹配支持子域名和路径 glob');
  const lzuPackage = SCHOOL_ADAPTER_PACKAGES.find((item) => item.id === 'lzu-ytms')!;
  const blockedPage = new JSDOM('<title>材料上传</title><input type="file">', { url: 'https://yjszs.lzu.edu.cn/lzuyjsytms/upload' });
  check(!matchAdapterPage(lzuPackage, blockedPage.window.document, blockedPage.window.location.href).allowed, '页面门禁：上传页不允许专项采集');

  const njustPrograms = SCHOOLS_WITH_PROGRAMS.find((school) => school.name === '南京理工大学')?.programs || [];
  check(njustPrograms.length === 2 && njustPrograms[0].entry !== njustPrograms[1].entry, '学校目录 V2：南理工预推免与夏令营分支完全隔离');

  const crawlProfile = emptyProfile();
  crawlProfile.basic.email = 'old@example.com';
  crawlProfile.fieldStates['basic.email'] = { locked: true, source: 'manual', updatedAt: new Date().toISOString(), confidence: 'verified' };
  const crawlSession = createCrawlSession(lzuPackage);
  const snapshot = {
    id: 'snapshot-test', adapterId: lzuPackage.id, schoolName: lzuPackage.schoolName, pageId: 'information', pageName: '信息填报', url: 'https://yjszs.lzu.edu.cn/lzuyjsytms/info', fingerprint: 'fixture', capturedAt: new Date().toISOString(),
    values: { 'basic.phone': '13800000000', 'basic.email': 'new@example.com' }, codebook: {}, tables: { academicPapers: [{ kind: '论文', start: '', end: '', title: '爬取论文', source: '', role: '', authors: '', itemType: '', level: '', status: '', summary: '', advisor: '', partition: '' }] }, warnings: [],
  };
  const mergedSession = addSnapshot(crawlSession, snapshot, lzuPackage);
  const preview = previewCrawlMerge(crawlProfile, mergedSession);
  check(preview.items.some((item) => item.path === 'basic.phone' && item.kind === 'new') && preview.items.some((item) => item.path === 'basic.email' && item.kind === 'locked'), '爬取预览：区分新增字段和锁定冲突');
  commitCrawlMerge(crawlProfile, mergedSession, { lockImported: true });
  check(crawlProfile.basic.phone === '13800000000' && crawlProfile.fieldStates['basic.phone'].locked && crawlProfile.basic.email === 'old@example.com', '爬取合并：新增内容可锁定，冲突保留原档案值');
  check(crawlProfile.academicPapers.length === 1 && !!crawlProfile.academicPapers[0].state?.locked, '爬取合并：新增原子表行带来源并锁定');

  const choiceDom = new JSDOM('<table><tr><th>报名记录</th><th>操作</th></tr><tr><td>计算机学院</td><td><a href="Apply.aspx?id=1">查看</a></td></tr><tr><td>软件学院</td><td><a href="Apply.aspx?id=2">查看</a></td></tr></table>');
  const choices = applicationChoicesFromPage(choiceDom.window.document);
  let choiceBlocked = false;
  try { rememberApplicationChoice(crawlSession, choices); } catch { choiceBlocked = true; }
  const selectedSession = rememberApplicationChoice(crawlSession, choices, 0);
  check(choices.length === 2 && choiceBlocked && !!selectedSession.selectedApplicationKey, '北邮报名记录：多行必须用户确认并记住所选分支');

  const contractDom = new JSDOM('<input id="xm"><select id="bkbyxx"><option value="10001">北京大学</option><option value="10610">四川大学</option></select>', { url: 'https://yjszs.lzu.edu.cn/lzuyjsytms/info' });
  const contractProfile = emptyProfile();
  contractProfile.education.university = '四川大学';
  setProfileCode(contractProfile, 'education.university', 'moe.school', '10610', '四川大学');
  const contractResults = fillAdapterContract(contractProfile, contractDom.window.document, contractDom.window.location.href, lzuPackage);
  check((contractDom.window.document.getElementById('bkbyxx') as HTMLSelectElement).value === '10610' && contractResults.some((item) => item.profilePath === 'education.university' && item.status === 'filled'), '控件驱动：学校代码与显示名称成对写入并回读');
  setProfileCode(contractProfile, 'education.university', 'moe.school', '10001', '四川大学');
  const mismatchResults = fillAdapterContract(contractProfile, contractDom.window.document, contractDom.window.location.href, lzuPackage);
  check(mismatchResults.some((item) => item.profilePath === 'education.university' && item.status === 'failed'), '控件驱动：代码与名称不一致时停止写入');

  let executableRejected = false;
  try { validateAdapterPackage({ ...lzuPackage, bad: () => true } as any); } catch { executableRejected = true; }
  check(executableRejected, '远程适配包：拒绝函数和远程可执行代码');
  let coreRejected = false;
  try { validateRemoteRules({ schemaVersion: 1, minCoreVersion: '99.0.0', adapters: [], packages: [] }); } catch { coreRejected = true; }
  check(coreRejected, '规则候选校验：最低核心版本不满足时拒绝切换');
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
    console.log('DBG rz=', rz, w.sessionStorage.getItem('tui-pick-debug'));
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

  // 北科大回归：页面已有 8 条服务器展示行时，仍须补齐后续 6 条，并把断点推进到第 14 条。
  {
    const existingRows = Array.from({ length: 8 }, (_, index) =>
      `<tr><td>2025-01</td><td>测试来源</td><td>成果${index + 1}</td><td>1/1</td></tr>`,
    ).join('');
    const wUstbRows = new JSDOM(
      '<body><table id="ustbAchievements"><tbody>' +
        '<tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        existingRows +
        '<tr><td><input></td><td><input></td><td><input></td><td><input></td></tr>' +
        '</tbody></table><button id="ustbAdd">新增一行</button></body>',
    );
    const dUstbRows = wUstbRows.window.document;
    wUstbRows.window.Element.prototype.getBoundingClientRect = rect as never;
    dUstbRows.getElementById('ustbAdd')!.addEventListener('click', () => {
      const row = (dUstbRows.getElementById('ustbAchievements') as HTMLTableElement).querySelector('tbody')!.insertRow();
      row.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
    });
    const pUstbRows = emptyProfile();
    for (let index = 0; index < 14; index++) {
      pUstbRows.research.push({ title: `成果${index + 1}`, type: '竞赛', date: '2025-01', role: '1/1', description: '测试来源' });
    }
    let observedNextIndex = 0;
    const filledUstbRows = await fillAchievements(
      pUstbRows,
      dUstbRows,
      0,
      undefined,
      10,
      false,
      (nextIndex) => { observedNextIndex = Math.max(observedNextIndex, nextIndex); },
    );
    const allTitles = (Array.from(dUstbRows.querySelectorAll('#ustbAchievements tr')) as HTMLTableRowElement[])
      .slice(1)
      .map((row) => ((row.cells[2].querySelector('input') as HTMLInputElement | null)?.value || row.cells[2].textContent || '').trim());
    check(filledUstbRows === 6 && allTitles.length === 14 && new Set(allTitles).size === 14, '北科大学术成果：已有 8 条时补齐到 14 条且不重复');
    check(observedNextIndex === 14 && nextRowJobIndex(0, filledUstbRows, observedNextIndex) === 14, '北科大学术成果：已有行与新增行共同推进续填断点');
  }

  // v2.0.1 回归：14 项成果、仅 1 行预置数据、加行按钮在表格外（合工大字段报告同款形态）→ 必须全部填满，每个条目恰好一次加行
  {
    const w14 = new JSDOM(
      '<body><table id="a14"><tbody>' +
        '<tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td>2025-02</td><td>预置来源</td><td>预置行</td><td>1/1</td></tr>' +
        '</tbody></table><button id="addNewRow">新增一行</button></body>',
      { url: 'https://x.example.edu.cn/fill' },
    );
    const d14 = w14.window.document;
    w14.window.Element.prototype.getBoundingClientRect = rect as never;
    let addClicks = 0;
    d14.getElementById('addNewRow')!.addEventListener('click', () => {
      addClicks += 1;
      const row = (d14.getElementById('a14') as HTMLTableElement).querySelector('tbody')!.insertRow();
      row.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
    });
    const p14 = emptyProfile();
    for (let index = 0; index < 14; index++) {
      p14.research.push({ title: `成果${index + 1}`, type: '竞赛', date: '2025-01', role: '1/1', description: '测试来源' });
    }
    const filled14 = await fillAchievements(p14, d14, 0, undefined, 25, false);
    const table14 = d14.getElementById('a14') as HTMLTableElement;
    const rows14 = table14.querySelectorAll('tr').length;
    const titles14 = Array.from(table14.querySelectorAll('tr'))
      .slice(1)
      .map((row) => ((row.cells[2].querySelector('input') as HTMLInputElement | null)?.value || row.cells[2].textContent || '').trim());
    check(filled14 === 14, `14 项成果全部填满，不再停在 10 条（实际 ${filled14}）`);
    check(rows14 === 16, `表头 + 预置行 + 14 条新行（实际数据行 ${rows14 - 1}）`);
    check(addClicks === 14, `验证式加行：每个条目恰好一次点击（实际 ${addClicks}）`);
    check(new Set(titles14).size === 15 && titles14.includes('预置行'), '预置行保留且 14 条标题不重复');
  }

  // 同名成果按标题去重（巨能填同款语义）：页面已有同题名行即跳过，宁可不填也不产生重复行；
  // 被跳过的条目会写入 duplicate 决策日志，字段报告可直接定位
  {
    const wDup = new JSDOM(
      '<body><table id="dupT"><tbody>' +
        '<tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td>2024-01</td><td>某期刊</td><td>同题成果</td><td>1/3</td></tr>' +
        '</tbody></table><button id="dupAdd">新增一行</button></body>',
      { url: 'https://x.example.edu.cn/dup' },
    );
    const dDup = wDup.window.document;
    wDup.window.Element.prototype.getBoundingClientRect = rect as never;
    let dupAdds = 0;
    dDup.getElementById('dupAdd')!.addEventListener('click', () => {
      dupAdds += 1;
      const row = (dDup.getElementById('dupT') as HTMLTableElement).querySelector('tbody')!.insertRow();
      row.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
    });
    const pDup = emptyProfile();
    pDup.research.push({ title: '同题成果', type: '论文', date: '2024-01', role: '1/3', description: '某期刊' });
    pDup.research.push({ title: '同题成果', type: '论文', date: '2025-06', role: '1/2', description: '另一期刊' });
    const filledDup = await fillAchievements(pDup, dDup, 0, undefined, 5, false);
    const rowsDup = (dDup.getElementById('dupT') as HTMLTableElement).querySelectorAll('tr').length;
    const dupDecisions = JSON.parse(wDup.window.sessionStorage.getItem('tui-row-decision') || '[]') as Array<{ decision: string }>;
    check(filledDup === 0 && rowsDup === 2 && dupAdds === 0, '同名成果按标题去重，不产生重复行');
    check(dupDecisions.filter((d) => d.decision === 'duplicate').length === 2, '被去重跳过的条目写入 duplicate 决策日志');
  }

  // 表格存在但无加行按钮：立即停止、不悬挂、决策日志记录 no-add-btn（供字段报告定位）
  {
    const wNoBtn = new JSDOM(
      '<body><table id="nbT"><tbody>' +
        '<tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td>2025-02</td><td>来源</td><td>已有一条</td><td>1/1</td></tr>' +
        '</tbody></table></body>',
      { url: 'https://x.example.edu.cn/nobtn' },
    );
    const dNoBtn = wNoBtn.window.document;
    wNoBtn.window.Element.prototype.getBoundingClientRect = rect as never;
    const pNoBtn = emptyProfile();
    for (let index = 0; index < 3; index++) pNoBtn.research.push({ title: `条目${index + 1}`, type: '竞赛', date: '2025-03', role: '1/1', description: '' });
    const startedAt = Date.now();
    const filledNoBtn = await fillAchievements(pNoBtn, dNoBtn, 0, undefined, 5, false);
    const decisions = JSON.parse(wNoBtn.window.sessionStorage.getItem('tui-row-decision') || '[]') as Array<{ decision: string }>;
    check(filledNoBtn === 0 && Date.now() - startedAt < 5000, '无加行按钮时立即停止不悬挂');
    check(decisions.some((d) => d.decision === 'no-add-btn'), '无加行按钮写入 no-add-btn 决策日志');
  }

  // 系统行数上限：弹窗提示后停止连点，决策日志记录 limit-blocked（巨能填 known_table_row_limits 同款停止条件）
  {
    const wCap = new JSDOM(
      '<body><table id="capT"><tbody>' +
        '<tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td>2025-02</td><td>来源</td><td>预置</td><td>1/1</td></tr>' +
        '</tbody></table><button id="capAdd">新增一行</button><div id="capDialog" class="layui-layer" style="display:none"></div></body>',
      { url: 'https://x.example.edu.cn/cap' },
    );
    const dCap = wCap.window.document;
    wCap.window.Element.prototype.getBoundingClientRect = rect as never;
    const dialog = dCap.getElementById('capDialog')!;
    dCap.getElementById('capAdd')!.addEventListener('click', () => {
      const table = dCap.getElementById('capT') as HTMLTableElement;
      if (table.querySelectorAll('tr').length - 1 >= 3) {
        dialog.textContent = '很抱歉，记录数已达上限，不能超过3条！';
        dialog.style.display = 'block';
        return;
      }
      const row = table.querySelector('tbody')!.insertRow();
      row.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
    });
    const pCap = emptyProfile();
    for (let index = 0; index < 5; index++) pCap.research.push({ title: `上限条目${index + 1}`, type: '竞赛', date: '2025-04', role: '1/1', description: '' });
    const filledCap = await fillAchievements(pCap, dCap, 0, undefined, 5, false);
    const capRows = (dCap.getElementById('capT') as HTMLTableElement).querySelectorAll('tr').length;
    const capDecisions = JSON.parse(wCap.window.sessionStorage.getItem('tui-row-decision') || '[]') as Array<{ decision: string }>;
    check(filledCap === 2 && capRows === 4, `达上限后优雅停止（填 ${filledCap} 条、${capRows - 1} 行）`);
    check(capDecisions.some((d) => d.decision === 'limit-blocked'), '行数上限写入 limit-blocked 决策日志');
  }

  // 首选点击策略无效（原生序列被页面忽略）：跨轮轮换到裸 click 策略后仍能加行填写
  {
    const wEsc = new JSDOM(
      '<body><table id="escT"><tbody>' +
        '<tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '<tr><td>2025-02</td><td>来源</td><td>预置</td><td>1/1</td></tr>' +
        '</tbody></table><button id="escAdd">新增一行</button></body>',
      { url: 'https://x.example.edu.cn/esc' },
    );
    const dEsc = wEsc.window.document;
    wEsc.window.Element.prototype.getBoundingClientRect = rect as never;
    const escBtn = dEsc.getElementById('escAdd') as HTMLElement & { _sawMousedown?: boolean };
    // 模拟只响应"裸 click"的按钮：原生点击序列（带 mousedown 前导）被忽略，仅 dispatch 策略生效
    escBtn.addEventListener('mousedown', () => {
      escBtn._sawMousedown = true;
    });
    escBtn.addEventListener('click', () => {
      const sawMousedown = escBtn._sawMousedown;
      escBtn._sawMousedown = false;
      if (sawMousedown) return;
      const row = (dEsc.getElementById('escT') as HTMLTableElement).querySelector('tbody')!.insertRow();
      row.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
    });
    const pEsc = emptyProfile();
    pEsc.research.push({ title: '升级策略条目', type: '竞赛', date: '2025-05', role: '1/1', description: '' });
    // 模拟外层轮次重试：全局点击序号逐轮递增 → 策略 0（原生，被忽略）→ 策略 1 → 策略 2（裸 click，生效）
    let escSeq = 0;
    const round1 = await fillAchievements(pEsc, dEsc, 0, () => escSeq++, 5, false);
    const round2 = await fillAchievements(pEsc, dEsc, 0, () => escSeq++, 5, false);
    const round3 = await fillAchievements(pEsc, dEsc, 0, () => escSeq++, 5, false);
    const escRows = (dEsc.getElementById('escT') as HTMLTableElement).querySelectorAll('tr').length;
    check(round1 === 0 && round2 === 0, '被页面忽略的点击策略不误报成功');
    check(round3 === 1 && escRows === 3, `策略跨轮轮换到裸 click 后加行填写成功（填 ${round3}，${escRows - 1} 行）`);
  }

  // 行任务走向判定（纯函数）：成功清零连续失败；表格在但无效时保留任务；表格消失才按无表放弃
  {
    const keep = decideRowJobRound({ callStart: 10, nextIndex: 10, clicked: true, processed: 0, rowsBefore: 11, rowsAfter: 11, failsBefore: 1, entriesLength: 14, tablePresentNow: true });
    check(keep.action === 'keep' && keep.fails === 2 && !keep.warn, '加行无效但表格在：保留任务并累计连续失败');
    const keepWarn = decideRowJobRound({ callStart: 10, nextIndex: 10, clicked: false, processed: 0, rowsBefore: 11, rowsAfter: 11, failsBefore: 2, entriesLength: 14, tablePresentNow: true });
    check(keepWarn.action === 'keep' && keepWarn.warn, '连续失败达阈值时给出可恢复告警');
    const dropNoTable = decideRowJobRound({ callStart: 10, nextIndex: 10, clicked: false, processed: 0, rowsBefore: 11, rowsAfter: -1, failsBefore: 0, entriesLength: 14, tablePresentNow: false });
    check(dropNoTable.action === 'drop-no-table' && dropNoTable.remaining === 4, '目标表确实不在本页才按无表放弃并报告剩余条数');
    const dropFails = decideRowJobRound({ callStart: 10, nextIndex: 10, clicked: true, processed: 0, rowsBefore: 11, rowsAfter: 11, failsBefore: ROW_JOB_FAIL_CAP - 1, entriesLength: 14, tablePresentNow: true });
    check(dropFails.action === 'drop-fails' && dropFails.remaining === 4, `连续 ${ROW_JOB_FAIL_CAP} 轮无进展才放弃任务`);
    const progressed = decideRowJobRound({ callStart: 10, nextIndex: 12, clicked: true, processed: 2, rowsBefore: 11, rowsAfter: 13, failsBefore: 4, entriesLength: 14, tablePresentNow: true });
    check(progressed.action === 'keep' && progressed.fails === 0 && progressed.startIndex === 12, '有进展即清零连续失败并推进断点');
    const complete = decideRowJobRound({ callStart: 12, nextIndex: 14, clicked: true, processed: 2, rowsBefore: 13, rowsAfter: 15, failsBefore: 0, entriesLength: 14, tablePresentNow: true });
    check(complete.action === 'complete', '条目全部处理后任务完成');
  }

  // 奖励情况：页面已有"时间+内容"但缺"地点"的行 → 只补空白地点、不覆盖已有内容，并推进断点（合工大"尚真笃学"漏填地点的根因）
  {
    const wAg = new JSDOM(
      '<body><table><tbody><tr><td>何时何地何原因受过何种奖励（内容中不得含有|等字符）</td></tr></tbody></table>' +
        '<table id="agT"><tbody>' +
        '<tr><th>时间（日期格式：2018-11）</th><th>地点</th><th>内容</th></tr>' +
        '<tr><td><input value="2024-10"></td><td><input></td><td><input value="尚真笃学奖学金"></td></tr>' +
        '</tbody></table><button id="agAdd">新增一行</button></body>',
      { url: 'https://x.example.edu.cn/award' },
    );
    const dAg = wAg.window.document;
    wAg.window.Element.prototype.getBoundingClientRect = rect as never;
    dAg.getElementById('agAdd')!.addEventListener('click', () => {
      const row = (dAg.getElementById('agT') as HTMLTableElement).querySelector('tbody')!.insertRow();
      row.innerHTML = '<td><input></td><td><input></td><td><input></td>';
    });
    const pAg = emptyProfile();
    pAg.awards.push({ date: '2024-10', place: '合肥', content: '尚真笃学奖学金' });
    pAg.awards.push({ date: '2025-01', place: '芜湖', content: 'ents 竞赛奖学金'.slice(5) });
    const processedAg: number[] = [];
    const filledAg = await fillAwardRows(pAg, dAg, 0, undefined, 5, false, (next) => processedAg.push(next));
    const agRows = (dAg.getElementById('agT') as HTMLTableElement).querySelectorAll('tr');
    const place1 = (agRows[1].cells[1].querySelector('input') as HTMLInputElement).value;
    const content1 = (agRows[1].cells[2].querySelector('input') as HTMLInputElement).value;
    const time1 = (agRows[1].cells[0].querySelector('input') as HTMLInputElement).value;
    const place2 = (agRows[2].cells[1].querySelector('input') as HTMLInputElement).value;
    const content2 = (agRows[2].cells[2].querySelector('input') as HTMLInputElement).value;
    check(place1 === '合肥' && content1 === '尚真笃学奖学金' && time1 === '2024-10', '已有奖励行只补空白地点，不覆盖时间和内容');
    check(filledAg === 1 && agRows.length === 3, `第二条奖励正常新增一行（填 ${filledAg}，共 ${agRows.length - 1} 个数据行）`);
    check(place2 === '芜湖' && content2 === '竞赛奖学金', '新增奖励行时间、地点、内容完整');
    check(processedAg.join(',') === '1,2' && nextRowJobIndex(0, filledAg, processedAg[processedAg.length - 1]) === 2, '已存在行也推进续填断点，不会原地空转');
  }

  // 奖励情况：所有条目在页面均已存在（服务器文本行）→ 不再点击加行，断点直接推进到末尾并完成任务
  {
    const wAg2 = new JSDOM(
      '<body><table><tbody><tr><td>何时何地何原因受过何种奖励（内容中不得含有|等字符）</td></tr></tbody></table>' +
        '<table id="ag2T"><tbody>' +
        '<tr><th>时间（日期格式：2018-11）</th><th>地点</th><th>内容</th></tr>' +
        '<tr><td>2024-10</td><td>合肥</td><td>尚真笃学奖学金</td></tr>' +
        '<tr><td>2025-01</td><td>芜湖</td><td>竞赛奖学金</td></tr>' +
        '</tbody></table></body>',
      { url: 'https://x.example.edu.cn/award2' },
    );
    const dAg2 = wAg2.window.document;
    wAg2.window.Element.prototype.getBoundingClientRect = rect as never;
    const pAg2 = emptyProfile();
    pAg2.awards.push({ date: '2024-10', place: '合肥', content: '尚真笃学奖学金' });
    pAg2.awards.push({ date: '2025-01', place: '芜湖', content: '竞赛奖学金' });
    const processedAg2: number[] = [];
    const startedAg2 = Date.now();
    const filledAg2 = await fillAwardRows(pAg2, dAg2, 0, undefined, 5, false, (next) => processedAg2.push(next));
    check(filledAg2 === 0 && processedAg2.join(',') === '1,2' && Date.now() - startedAg2 < 5000, '全部已存在的奖励不再加行且断点直达末尾，不空转');
  }

  // 主世界桥：白名单命令在页面自身 JS 环境执行；危险全局拒绝；未装桥时快速失败不空等
  {
    const wB = new JSDOM('<body><div id="bHost"><input id="bIn" v-model="form.school"></div><button id="bBtn"></button><div id="bJqx"></div></body>', { url: 'https://x.example.edu.cn/world' });
    const dB = wB.window.document;
    wB.window.Element.prototype.getBoundingClientRect = rect as never;
    installMainWorldBridge(dB);
    check(mainWorldReady(dB), '主世界桥安装后 documentElement 带就绪标记');

    const probeArgs: unknown[] = [];
    (wB.window as any).__tuiProbe = (...args: unknown[]) => {
      probeArgs.push(...args);
      return 'done';
    };
    const invoke = await requestMainWorld(dB, 'invoke-fn', { name: '__tuiProbe', args: [1, 'a'] });
    check(invoke.ok && probeArgs.length === 2 && probeArgs[0] === 1, 'invoke-fn 可调用页面具名全局函数');

    const forbidden = await requestMainWorld(dB, 'invoke-fn', { name: 'eval', args: ['1+1'] });
    check(!forbidden.ok && forbidden.reason === 'fn-forbidden', 'invoke-fn 拒绝 eval 等危险全局');

    const unknown = await requestMainWorld(dB, 'no-such-cmd', {});
    check(!unknown.ok && unknown.reason === 'unknown-cmd', '未注册命令被拒绝');

    let jqueryTarget: Element | null = null;
    let jqxSelected = '';
    const jqxItems = [{ label: '华南理工大学' }, { label: '西安理工大学' }];
    const jqueryStub: any = (el: Element) => ({
      trigger: (type: string) => { void type; jqueryTarget = el; },
      jqxDropDownList: (command: string, item?: { label?: string }) => {
        if (command === 'getItems') return jqxItems;
        if (command === 'selectItem' && item) jqxSelected = item.label || '';
        return undefined;
      },
    });
    jqueryStub.fn = { jqxDropDownList() { /* 只用于证明页面已加载 jqx 插件 */ } };
    (wB.window as any).jQuery = jqueryStub;
    const clicked = await mainWorldJqueryClick(dB, dB.getElementById('bBtn')!);
    check(clicked && jqueryTarget === dB.getElementById('bBtn'), 'jquery-click 经主世界桥触发目标元素');

    const jqxPicked = await mainWorldJqxSelectLabel(dB, dB.getElementById('bJqx')!, '西安理工大学');
    check(jqxPicked.ok && jqxSelected === '西安理工大学', 'jqx-select-label 通过完整数据模型精确选中虚拟列表项');
    const jqxUnsafeFuzzy = await mainWorldJqxSelectLabel(dB, dB.getElementById('bJqx')!, '华南理工大学广州国际校区');
    check(!jqxUnsafeFuzzy.ok && jqxUnsafeFuzzy.reason === 'no-match' && jqxSelected === '西安理工大学', 'jqx-select-label 拒绝用过短选项反向模糊匹配长学校名');

    const host = dB.getElementById('bHost')!;
    (host as any).__vue__ = {
      $data: { form: { school: '' } },
      $forceUpdate() { /* 标记调用即可 */ },
    };
    const wrote = await mainWorldVueModelWrite(dB, dB.getElementById('bIn')!, '西安理工大学');
    check(wrote && (host as any).__vue__.$data.form.school === '西安理工大学', 'vue-model-write 按 v-model 键路径直写 $data');

    const missing = await requestMainWorld(dB, 'vue-model-write', { selector: '#bHost', value: 'x' });
    check(!missing.ok && missing.reason === 'no-v-model', '无 v-model 属性的元素不猜键名');

    (wB.window as any).__doPostBack = (target: string, arg: string) => {
      probeArgs.push(`pb:${target}:${arg}`);
    };
    const pb = await requestMainWorld(dB, 'postback', { target: 'ctl00$btnNext', argument: '' });
    check(pb.ok && probeArgs.includes('pb:ctl00$btnNext:'), 'postback 命令复用页面自身 __doPostBack');

    const wNoBridge = new JSDOM('<body></body>', { url: 'https://x.example.edu.cn/nobridge' });
    const started = Date.now();
    const absent = await requestMainWorld(wNoBridge.window.document, 'invoke-fn', { name: '__tuiProbe' });
    check(!absent.ok && absent.reason === 'no-bridge' && Date.now() - started < 200, '未安装桥的页面快速返回失败，不空等超时');
  }

  // 写前临时解锁：readonly/disabled 控件写入时临时翻转、写后立即恢复，页面校验器才能看到值
  {
    const wU = new JSDOM(
      '<body><input id="uRo" readonly><input id="uDis" disabled><select id="uSel" disabled><option value=""></option><option value="6">六级</option></select></body>',
      { url: 'https://x.example.edu.cn/unlock' },
    );
    const dU = wU.window.document;
    const ro = dU.getElementById('uRo') as HTMLInputElement;
    const dis = dU.getElementById('uDis') as HTMLInputElement;
    const sel = dU.getElementById('uSel') as HTMLSelectElement;
    check(isLockedControl(ro) && isLockedControl(dis) && isLockedControl(sel), '锁定态探测：readonly/disabled 均被识别');

    withUnlocked(ro, () => {
      check(!ro.hasAttribute('readonly'), '解锁窗口内 readonly 被临时移除');
      ro.value = '写入值';
    });
    check(ro.value === '写入值' && ro.hasAttribute('readonly'), '写后 readonly 立即恢复且值保留');

    withUnlocked(dis, () => {
      check(dis.disabled === false, '解锁窗口内 disabled 被临时移除');
      dis.value = '启用写入';
    });
    check(dis.value === '启用写入' && dis.disabled === true, '写后 disabled 立即恢复且值保留');

    // 禁用下拉：trySetSelect 走解锁窗口写入并派发事件
    let sawChange = false;
    sel.addEventListener('change', () => {
      sawChange = true;
      check(sel.disabled === false, 'change 事件触发时控件处于启用态（页面校验器可感知）');
    });
    check(trySetSelect(sel, '六级') && sel.value === '6', '禁用下拉 trySetSelect 写入成功');
    check(sawChange && sel.disabled === true && sel.value === '6', '写后 disabled 恢复且选中值保留');

    // 嵌套解锁窗口：内层不重复翻转，外层统一恢复
    withUnlocked(ro, () => {
      withUnlocked(ro, () => {
        ro.value = '嵌套写入';
      });
      check(!ro.hasAttribute('readonly'), '嵌套内层不提前恢复锁定');
    });
    check(ro.hasAttribute('readonly') && ro.value === '嵌套写入', '嵌套窗口由外层统一恢复');
  }

  // 弹窗归责：点击后新出现的"修改"弹窗立即温和关闭、绝不填写；点击前已存在的弹窗不归责、不误关
  {
    const wEd = new JSDOM(
      '<body>' +
        '<div id="preDlg" class="layui-layer" style="display:none"><div class="layui-layer-title">修改成果</div><input><span class="layui-layer-close">✕</span></div>' +
        '<div id="editDlg" class="layui-layer" style="display:none"><div class="layui-layer-title">修改成果</div><input id="editTitle"><span class="layui-layer-close" id="editClose">✕</span></div>' +
        '<button id="edAdd">新增一行</button></body>',
      { url: 'https://x.example.edu.cn/editdlg' },
    );
    const dEd = wEd.window.document;
    wEd.window.Element.prototype.getBoundingClientRect = rect as never;
    const preDlg = dEd.getElementById('preDlg')!;
    const editDlg = dEd.getElementById('editDlg')!;
    preDlg.style.display = 'block'; // 点击前已存在（如选择器弹窗）：不归责到本次点击
    let closedByUser = false;
    dEd.getElementById('editClose')!.addEventListener('click', () => {
      editDlg.style.display = 'none';
      closedByUser = true;
    });
    const before = visibleDialogRoots(dEd);
    check(before.length === 1 && before[0] === preDlg, '可见弹窗采集：只包含点击前已存在的弹窗');
    let fillAttempted = false;
    const outcome = await handleDialogAfterClick(dEd, before, 'achievements', 0, async () => {
      fillAttempted = true;
      return true;
    });
    const closedByUserAfterFirst = closedByUser;
    // 点击"新增"后页面打开了编辑弹窗（模拟 editDlg 显示）
    editDlg.style.display = 'block';
    const outcome2 = await handleDialogAfterClick(dEd, before, 'achievements', 0, async () => {
      fillAttempted = true;
      return true;
    });
    check(outcome === 'none' && !closedByUserAfterFirst, '点击前已存在的弹窗不归责、不被误关');
    check(outcome2 === 'closed-edit' && !fillAttempted, '新出现的编辑弹窗被立即关闭且绝不填写');
    check(editDlg.style.display === 'none' && closedByUser, '编辑弹窗经关闭控件温和关闭');
  }

  // 弹窗式加行（完整链路）：点击"新增"打开新增弹窗 → 弹窗内按语义填字段 → 点确定 → 行真实增长才算成功
  {
    const wDg = new JSDOM(
      '<body>' +
        '<table id="dlgT"><tbody>' +
        '<tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
        '</tbody></table>' +
        '<button id="dlgAdd">新增一行</button>' +
        '<div id="dlg" class="layui-layer" style="display:none"><div class="layui-layer-title">新增学术成果</div>' +
        '<input id="dTime" placeholder="时间（2018-11）"><input id="dJournal" placeholder="发表刊物或出版社">' +
        '<input id="dTitle" placeholder="标题"><input id="dRole" placeholder="作者排名">' +
        '<button id="dlgOk">确定</button></div></body>',
      { url: 'https://x.example.edu.cn/dlgadd' },
    );
    const dDg = wDg.window.document;
    wDg.window.Element.prototype.getBoundingClientRect = rect as never;
    const dlg = dDg.getElementById('dlg')!;
    dDg.getElementById('dlgAdd')!.addEventListener('click', () => {
      dlg.style.display = 'block'; // 弹窗式加行：点击不直接加行，而是打开弹窗
    });
    dDg.getElementById('dlgOk')!.addEventListener('click', () => {
      const table = dDg.getElementById('dlgT') as HTMLTableElement;
      const row = table.querySelector('tbody')!.insertRow();
      row.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
      (row.cells[0].querySelector('input') as HTMLInputElement).value = (dDg.getElementById('dTime') as HTMLInputElement).value;
      (row.cells[1].querySelector('input') as HTMLInputElement).value = (dDg.getElementById('dJournal') as HTMLInputElement).value;
      (row.cells[2].querySelector('input') as HTMLInputElement).value = (dDg.getElementById('dTitle') as HTMLInputElement).value;
      (row.cells[3].querySelector('input') as HTMLInputElement).value = (dDg.getElementById('dRole') as HTMLInputElement).value;
      dlg.style.display = 'none';
    });
    const pDg = emptyProfile();
    pDg.research.push({ title: '弹窗成果甲', type: '论文', date: '2024-03', role: '1/2', description: '测试期刊' });
    pDg.research.push({ title: '弹窗成果乙', type: '论文', date: '2025-05', role: '1/1', description: '另一期刊' });
    const processedDg: number[] = [];
    await fillAchievements(pDg, dDg, 0, undefined, 5, false, (next) => processedDg.push(next));
    const dgRows = (dDg.getElementById('dlgT') as HTMLTableElement).querySelectorAll('tr');
    const rowTitle = (index: number): string => (dgRows[index].cells[2].querySelector('input') as HTMLInputElement).value;
    const rowJournal = (index: number): string => (dgRows[index].cells[1].querySelector('input') as HTMLInputElement).value;
    check(dgRows.length === 3 && rowTitle(1) === '弹窗成果甲' && rowTitle(2) === '弹窗成果乙', '弹窗式加行逐条填写并确认，行真实增长');
    check(rowJournal(1) === '测试期刊' && rowJournal(2) === '另一期刊', '弹窗内刊物字段按语义映射写入');
    check(processedDg.join(',') === '1,2', '弹窗式加行推进续填断点');
    check(dlg.style.display === 'none', '确认后弹窗关闭，不残留遮挡后续字段');
  }

  // 假保存守卫：填写过的表格在保存回发后内容全空 → 告警；内容未变或表格消失（翻页）→ 不告警
  {
    const buildDoc = (withRows: boolean): Document => {
      const wS = new JSDOM(
        '<body><table id="svT"><tbody>' +
          '<tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
          (withRows
            ? '<tr><td><input value="2024-01"></td><td><input value="测试期刊"></td><td><input value="成果一"></td><td><input value="1/2"></td></tr>' +
              '<tr><td><input value="2024-02"></td><td><input value="测试期刊"></td><td><input value="成果二"></td><td><input value="2/2"></td></tr>'
            : '<tr><td><input></td><td><input></td><td><input></td><td><input></td></tr>') +
          '</tbody></table></body>',
        { url: 'https://x.example.edu.cn/saveguard' },
      );
      wS.window.Element.prototype.getBoundingClientRect = rect as never;
      return wS.window.document;
    };
    const filledDoc = buildDoc(true);
    const evidence = snapshotTableEvidence(filledDoc);
    const achievementsEvidence = evidence.find((item) => item.kind === 'achievements');
    check(!!achievementsEvidence && achievementsEvidence.rows === 2 && achievementsEvidence.filled === 2, '表格证据采集：行数与非空行数正确');

    const clearedDoc = buildDoc(false);
    check(detectFakeSave(evidence, clearedDoc) === 'achievements', '保存后表格还在但内容全空 → 判定疑似假保存');
    check(detectFakeSave(evidence, filledDoc) === null, '内容未变化 → 不告警');

    const emptyBefore = snapshotTableEvidence(clearedDoc);
    check(detectFakeSave(emptyBefore, clearedDoc) === null, '此前无已填内容 → 不告警');
  }

  // ===== 隐藏行串（川大/长大式"可见子表+隐藏行码串"）：编解码/同步/跨页 stash/富者优先 =====
  {
    const rows = [['2024-10', '奖学金A'], ['2024-11', '奖学金B']];
    const encoded = encodeBlobRows(rows);
    check(encoded === '2024-10|奖学金A#2024-11|奖学金B', '隐藏行串编码：| 连格、# 连行');
    check(JSON.stringify(parseBlobRows(encoded)) === JSON.stringify(rows), '隐藏行串解码与编码互逆');
    check(encodeBlobRows([['a|b', 'c#d']]) === 'a／b|c＃d', '单元格中的连接符替换为全角，防止串结构破坏');
    const capped = encodeBlobRows(Array.from({ length: 6 }, (_, i) => [`奖项${i}`, 'x'.repeat(200)]));
    check(capped.length <= 810 && capped.split('#').length === 6, '超软上限时缩格保行：所有行都保留');
    check(encodeBlobRows([['只有一行', '', '']]) === '只有一行', '尾部空格修剪、空行丢弃');
    check(blobLooksLike('2023-01|旧奖#2023-06|旧奖2') === true, '多行串识别为行码串');
    check(blobLooksLike('a|b') === false && blobLooksLike('10700') === false && blobLooksLike('') === false, '单格/两格单行/空值不误判为行码串');
    check(scoreRows([['a', ''], ['b', 'c']]) === 3, '富者优先评分 = 非空单元格数');
    check(scoreRows(applyRicherRows([['a', 'b']], [['x'], ['y', 'z']])) === 3, '富者优先取更富的一组');

    const wBlob = new JSDOM(
      '<body><form><table id="blobT"><tbody><tr><th>时间</th><th>名称</th></tr>' +
        '<tr><td><input name="bt0"></td><td><input name="bn0"></td></tr>' +
        '<tr><td><input name="bt1"></td><td><input name="bn1"></td></tr></tbody></table>' +
        '<input type="hidden" id="jlcf" value="2023-01|旧奖#2023-06|旧奖2"></form></body>',
      { url: 'https://x.example.edu.cn/blob' },
    );
    const dB = wBlob.window.document;
    wBlob.window.Element.prototype.getBoundingClientRect = rect as never;
    const blobTable = dB.querySelector('#blobT') as HTMLTableElement;
    const blobHidden = dB.querySelector('#jlcf') as HTMLInputElement;
    (dB.querySelector('[name="bt0"]') as HTMLInputElement).value = '2024-10';
    (dB.querySelector('[name="bn0"]') as HTMLInputElement).value = '新奖';
    (dB.querySelector('[name="bt1"]') as HTMLInputElement).value = '2024-11';
    (dB.querySelector('[name="bn1"]') as HTMLInputElement).value = '新奖2';
    const out1 = syncTableBlobs(dB, blobTable, { stashKey: 'table:awards' });
    check(blobHidden.value === '2024-10|新奖#2024-11|新奖2' && out1.synced.length === 1, '写完可见表后隐藏行串按页面实况重编码同步');
    const stashed1 = readStashedTableRows(dB, 'table:awards');
    check(!!stashed1 && stashed1.length === 2 && stashed1[0][1] === '新奖', '同步后实况行落盘跨页 stash');
    // 第二行实况被清空（模拟回发丢行）：隐藏串更富 → 不覆盖并落盘证据
    (dB.querySelector('[name="bt1"]') as HTMLInputElement).value = '';
    (dB.querySelector('[name="bn1"]') as HTMLInputElement).value = '';
    blobHidden.value = '2024-10|新奖#2023-06|旧奖2';
    const out3 = syncTableBlobs(dB, blobTable, { stashKey: 'table:awards' });
    check(out3.keptRicher.length === 1 && out3.synced.length === 0 && blobHidden.value === '2024-10|新奖#2023-06|旧奖2', '隐藏串比实况更富时不覆盖（疑似回发丢行证据）');
    const stashed3 = readStashedTableRows(dB, 'table:awards');
    check(!!stashed3 && stashed3.length === 2, '更富的旧串落盘 stash 供断点续填核对');
  }

  // ===== 组件下拉（无原生 select 的 jqx/"请选择..." 组件，广东工业大学 ehall 实测形态） =====
  {
    const wWdg = new JSDOM(
      '<body><table>' +
      '<tr><td>性别</td><td><input type="hidden" name="XB"><div class="bhtc-input-group"><span class="bhtc-dropdown">请选择...</span><span class="bhtc-input-group-addon"></span></div></td></tr>' +
      '<tr><td>政治面貌</td><td><input type="hidden" name="ZZMM"><span class="jqx-dropdownlist-state-normal"><div class="jqx-dropdownlist-content">请选择...</span></div></span></td></tr>' +
      '<tr><td>民族</td><td><span class="bhtc-dropdown">请选择...</span></td></tr>' +
      '</table></body>',
      { url: 'https://ehall.example.edu.cn/gsapp/x' },
    );
    wWdg.window.Element.prototype.getBoundingClientRect = rect as never;
    const dWdg = wWdg.window.document;
    const pWdg = emptyProfile();
    pWdg.basic.gender = '男';
    pWdg.basic.politicalStatus = '共青团员';
    pWdg.basic.nation = '汉族';
    const resWdg = fillAll(pWdg, dWdg);
    // 模拟组件行为：点开组件 → body 级浮层 ul/li → 点选项后组件脚本写隐藏域/组件文本
    const optionFor = (kind: string): string[] => (kind === "XB" ? ["男", "女"] : kind === "ZZMM" ? ["群众", "中共党员", "共青团员"] : ["汉族", "回族"]);
    dWdg.querySelectorAll("[data-tui-widget='dropdown']").forEach((widget: Element) => {
      const el = widget as HTMLElement;
      const key = el.getAttribute('data-tui-widget-key') || '';
      const kind = key.includes("basic.gender") ? "XB" : key.includes("politicalStatus") ? "ZZMM" : "MZ";
      el.addEventListener('click', () => {
        dWdg.querySelector('.wdg-pop')?.remove();
        const pop = dWdg.createElement('ul');
        pop.className = 'wdg-pop';
        for (const opt of optionFor(kind)) {
          const li = dWdg.createElement('li');
          li.textContent = opt;
          li.addEventListener('click', () => {
            const carrier = dWdg.querySelector(`[data-tui-widget-key="${key}"][data-tui-widget="dropdown-value"]`) as HTMLInputElement | null;
            if (carrier) carrier.value = opt;
            el.textContent = opt;
            el.setAttribute('data-tui-value', opt);
            pop.remove();
          });
          pop.appendChild(li);
        }
        dWdg.body.appendChild(pop);
      });
    });
    const wdgItems = resWdg.items.filter((i) => i.status === "picker");
    check(wdgItems.length === 3, `组件下拉识别：性别/政治面貌/民族 3 个组件字段进入弹窗点选流程（实际 ${wdgItems.length}）`);
    const xbCarrier = dWdg.querySelector('[name="XB"]') as HTMLInputElement;
    const zzmmCarrier = dWdg.querySelector('[name="ZZMM"]') as HTMLInputElement;
    const xbWidget = dWdg.querySelector('[data-tui-widget="dropdown"][data-tui-widget-key*="gender"]') as HTMLElement;
    const nationWidget = dWdg.querySelector('[data-tui-widget="dropdown"][data-tui-widget-key*="nation"]') as HTMLElement;
    const xbPick = await pickInPage(dWdg, xbCarrier, '男');
    console.log('DBG xbPick=', xbPick, 'carrier=', JSON.stringify(xbCarrier.value), 'widget=', JSON.stringify(xbWidget.textContent), 'debug=', wWdg.window.sessionStorage.getItem('tui-pick-debug'));
    check(xbPick === 'picked' && xbCarrier.value === '男' && xbWidget.textContent === '男', '组件下拉：性别点开浮层点选后组件脚本写回值与文本');
    const zzmmPick = await pickInPage(dWdg, zzmmCarrier, '共青团员');
    check(zzmmPick === 'picked' && zzmmCarrier.value === '共青团员', '组件下拉：政治面貌在多选项中精确点选');
    const nationPick = await pickInPage(dWdg, nationWidget, '汉族');
    check(nationPick === 'picked' && nationWidget.textContent === '汉族' && nationWidget.getAttribute('data-tui-value') === '汉族', '组件下拉：无隐藏域组件以组件文本为值载体并打已选标记');
    const xbRepeat = await pickInPage(dWdg, xbCarrier, '男');
    check(xbRepeat === 'picked', '组件下拉：已选组件幂等跳过，不重复弹层');
  }
  // ===== 组件下拉（广工大 ehall 完整形态）：英文选项 jqx-item 预渲染 + 显示输入框 + 标签格分离 =====
  {
    const wGdut = new JSDOM(
      '<body><table>' +
      '<tr><td>性别</td><td><div class="bhtc-input-group"><input type="text" class="jqx-display-input"><span class="bhtc-dropdown">请选择...</span>' +
      '<span class="jqx-listitem-state-normal jqx-item">Male</span><span class="jqx-listitem-state-normal jqx-item">Female</span></div></td></tr>' +
      '<tr><td>政治面貌</td><td><input type="hidden" name="ZZMM"><span class="bhtc-dropdown">请选择...</span>' +
      '<span class="jqx-listitem-state-normal jqx-item">中共党员</span><span class="jqx-listitem-state-normal jqx-item">共青团员</span><span class="jqx-listitem-state-normal jqx-item">群众</span></td></tr>' +
      '</table></body>',
      { url: 'https://ehall.gdut.example.edu.cn/gsapp/x' },
    );
    wGdut.window.Element.prototype.getBoundingClientRect = rect as never;
    const dGdut = wGdut.window.document;
    const pGdut = emptyProfile();
    pGdut.basic.gender = '男';
    pGdut.basic.politicalStatus = '共青团员';
    const resGdut = fillAll(pGdut, dGdut);
    const gdutPickers = resGdut.items.filter((i) => i.status === 'picker');
    check(gdutPickers.length === 2 && gdutPickers.some((i) => i.label === '性别') && gdutPickers.some((i) => i.label === '政治面貌'), '广工大形态：选项列表污染被剥离，性别/政治面貌按前格标签识别为组件点选');
    check(!resGdut.items.some((i) => i.status === 'noMatch'), '广工大形态：jqx 显示输入框被认领为值载体，不再产生 noMatch 噪音');
    // 模拟 jqx 组件脚本：点选项后写显示输入框/隐藏域
    const gdutDisplay = dGdut.querySelector('.jqx-display-input') as HTMLInputElement;
    dGdut.querySelectorAll('.jqx-item').forEach((opt: Element) => {
      opt.addEventListener('click', () => {
        const text = (opt as HTMLElement).textContent || '';
        if (text === 'Male' || text === 'Female') {
          gdutDisplay.value = text;
          (dGdut.querySelector('.bhtc-dropdown') as HTMLElement).textContent = text;
        } else {
          (dGdut.querySelector('[name="ZZMM"]') as HTMLInputElement).value = text;
          (dGdut.querySelectorAll('.bhtc-dropdown')[1] as HTMLElement).textContent = text;
        }
      });
    });
    const gdutGenderPick = await pickInPage(dGdut, gdutDisplay, '男');
    check(gdutGenderPick === 'picked' && gdutDisplay.value === 'Male', '广工大形态：性别按别名（男→male）点中英文选项 Male 并回读通过');
    const gdutZZPick = await pickInPage(dGdut, dGdut.querySelector('[name="ZZMM"]') as HTMLInputElement, '共青团员');
    check(gdutZZPick === 'picked' && (dGdut.querySelector('[name="ZZMM"]') as HTMLInputElement).value === '共青团员', '广工大形态：政治面貌在预渲染选项列表中精确点选');
  }
  // ===== 组件下拉（真实 jqx 嵌套）：最近包装层没有标签，标签与隐藏值字段位于外层 td =====
  {
    const wNestedGdut = new JSDOM(
      '<body><table>' +
      '<tr><td>性别</td><td><input type="hidden" name="XB"><div class="input-group"><div class="jqx-widget"><span>请选择...</span></div><span class="bhtc-input-group-addon"></span></div></td></tr>' +
      '<tr><td>政治面貌</td><td><input type="hidden" name="ZZMM"><div class="input-group"><div class="jqx-widget"><span>请选择...</span></div><span class="bhtc-input-group-addon"></span></div></td></tr>' +
      '</table></body>',
      { url: 'https://ehall.gdut.example.edu.cn/gsapp/nested' },
    );
    wNestedGdut.window.Element.prototype.getBoundingClientRect = rect as never;
    const dNestedGdut = wNestedGdut.window.document;
    const pNestedGdut = emptyProfile();
    pNestedGdut.basic.gender = '男';
    pNestedGdut.basic.politicalStatus = '共青团员';
    const nestedResult = fillAll(pNestedGdut, dNestedGdut);
    const nestedPickers = nestedResult.items.filter((item) => item.status === 'picker');
    check(
      nestedPickers.length === 2 && nestedPickers.some((item) => item.field === 'basic.gender') && nestedPickers.some((item) => item.field === 'basic.politicalStatus'),
      '广工大真实嵌套：跨过无标签 input-group，按外层 td 前一格识别性别与政治面貌',
    );
    check(
      (dNestedGdut.querySelector('[name="XB"]') as HTMLElement).getAttribute('data-tui-widget') === 'dropdown-value' &&
      (dNestedGdut.querySelector('[name="ZZMM"]') as HTMLElement).getAttribute('data-tui-widget') === 'dropdown-value',
      '广工大真实嵌套：外层 td 中的 XB/ZZMM 隐藏字段被认领为组件值载体',
    );
  }
  // ===== 组件下拉（零尺寸文字节点 + 页面自身含 tui- 类名）不得被误过滤 =====
  {
    const wZeroWidget = new JSDOM(
      '<body><table><tr><td>性别</td><td><input type="hidden" name="XB"><div class="wisedu-tui-dropdown jqx-dropdownlist" id="genderWidget"><span>请选择...</span></div></td></tr></table></body>',
      { url: 'https://ehall.gdut.example.edu.cn/gsapp/zero-size' },
    );
    const dZeroWidget = wZeroWidget.window.document;
    wZeroWidget.window.Element.prototype.getBoundingClientRect = function (this: Element) {
      return this.tagName === 'SPAN' ? ({ width: 0, height: 0 } as DOMRect) : rect();
    } as never;
    const pZeroWidget = emptyProfile();
    pZeroWidget.basic.gender = '男';
    const zeroResult = fillAll(pZeroWidget, dZeroWidget);
    check(zeroResult.items.some((item) => item.field === 'basic.gender' && item.status === 'picker'), '广工大零尺寸占位：向上解析可见 jqx 组件且不被页面 tui- 类名误过滤');
    const zeroProbe = probeComponentDropdowns(dZeroWidget);
    check(zeroProbe.length === 1 && zeroProbe[0].rawVisible === false && zeroProbe[0].triggerId === 'genderWidget' && zeroProbe[0].fieldAttrs.includes('input:XB'), '组件探针：脱敏输出零尺寸原因、点击本体和字段属性名');
  }
  // ===== 组件下拉（广工大真实结构）：bh-form-group + data-caption + 懒加载弹层 + 无名隐藏域写码 =====
  {
    const wBh = new JSDOM(
      '<body><form>' +
      '<div class="bh-form-group bh-required"><label>性别</label>' +
      '<div class="bh-ph-8 bh-form-readonly-input"><input type="hidden">' +
      '<div class="jqx-widget jqx-dropdownlist-state-normal" data-caption="性别" data-name="XBM" role="combobox" aria-owns="listBoxG">' +
      '<div class="jqx-dropdownlist-content"><span>请选择...</span></div></div></div></div>' +
      '<div class="bh-form-group bh-required"><label>政治面貌</label>' +
      '<div class="bh-ph-8 bh-form-readonly-input"><input type="hidden">' +
      '<div class="jqx-widget jqx-dropdownlist-state-normal" data-caption="政治面貌" data-name="ZZMMM" role="combobox" aria-owns="listBoxZ">' +
      '<div class="jqx-dropdownlist-content"><span>请选择...</span></div></div></div></div>' +
      '</form></body>',
      { url: 'https://ehall.gdut.example.edu.cn/gsapp/y' },
    );
    wBh.window.Element.prototype.getBoundingClientRect = rect as never;
    const dBh = wBh.window.document;
    // 模拟真实行为：点击组件后约 800ms 才从 data-url 异步渲染选项（广工大实测弹层打开前 DOM 里 0 个选项）；
    // 点选项后博思框架把代码写入无名隐藏域，并把组件显示文本改为所选标签
    const bhCodes: Record<string, Record<string, string>> = { 性别: { 男: '1', 女: '2' }, 政治面貌: { 共青团员: '03', 中共党员: '01', 群众: '13' } };
    const pBh = emptyProfile();
    pBh.basic.gender = '男';
    pBh.basic.politicalStatus = '共青团员';
    const resBh = fillAll(pBh, dBh);
    const bhPickers = resBh.items.filter((i) => i.status === 'picker');
    check(bhPickers.length === 2 && bhPickers.some((i) => i.label === '性别') && bhPickers.some((i) => i.label === '政治面貌'), '博思结构：data-caption 识别性别/政治面貌，bh-form-group 作用域命中');
    check(!resBh.items.some((i) => i.status === 'noMatch'), '博思结构：无名隐藏域载体不产生 noMatch 噪音');
    // fillAll 打上标记后，再为组件根接上模拟的懒加载弹层行为（点击事件绑定在 jqx 组件根上）
    for (const widget of Array.from(dBh.querySelectorAll('.jqx-widget[data-tui-widget="dropdown"]')) as HTMLElement[]) {
      const caption = widget.getAttribute('data-caption') || '';
      const listBoxId = widget.getAttribute('aria-owns') || 'listBoxX';
      widget.addEventListener('click', () => {
        setTimeout(() => {
          if (dBh.querySelector('#' + listBoxId)) return;
          const pop = dBh.createElement('div');
          pop.id = listBoxId;
          pop.className = 'jqx-listbox';
          for (const opt of Object.keys(bhCodes[caption] || {})) {
            const item = dBh.createElement('span');
            item.className = 'jqx-listitem-state-normal jqx-item';
            item.textContent = opt;
            item.addEventListener('click', () => {
              const carrier = widget.closest('.bh-ph-8')?.querySelector('input[type="hidden"]') as HTMLInputElement;
              if (carrier) carrier.value = bhCodes[caption][opt] || '';
              (widget.querySelector('.jqx-dropdownlist-content span') as HTMLElement).textContent = opt;
              pop.remove();
            });
            pop.appendChild(item);
          }
          dBh.body.appendChild(pop);
        }, 800);
      });
    }
    const bhCarriers = Array.from(dBh.querySelectorAll('[data-tui-widget="dropdown-value"]')) as HTMLInputElement[];
    check(bhCarriers.length === 2, `博思结构：两个组件都认领到值载体（实际 ${bhCarriers.length}）`);
    const bhGenderPick = await pickInPage(dBh, bhCarriers[0], '男');
    console.log('DBG bh clicks=', (wBh.window as any)._bhClicks, 'popFlag=', !!(wBh.window as any)._bhPop, 'popInDom=', !!dBh.querySelector('.jqx-listbox'), 'pick=', bhGenderPick);
    check(bhGenderPick === 'picked' && bhCarriers[0].value === '1', '博思结构：性别懒加载选项点选后隐藏域写入代码 1（男→male 别名或代码回读）');
    const bhZZPick = await pickInPage(dBh, bhCarriers[1], '共青团员');
    check(bhZZPick === 'picked' && bhCarriers[1].value === '03', '博思结构：政治面貌懒加载点选并按 VALUE_ALIASES 回读代码 03');
  }
  // ===== 组件下拉（真实广工大结构）：可见文字 span 仍须提升到 role=combobox 的 jqx 根节点 =====
  {
    const wRoleWidget = new JSDOM(
      '<body><div class="bh-form-group"><label>性别</label><div class="bh-ph-8 bh-form-readonly-input"><input type="hidden"><div id="realGenderWidget" role="combobox" class="jqx-widget jqx-dropdownlist-state-normal"><div id="dropdownlistWrapperrealGenderWidget"><div class="jqx-dropdownlist-content"><span>请选择...</span></div></div></div></div></div></body>',
      { url: 'https://ehall.gdut.example.edu.cn/gsapp/role-combobox' },
    );
    wRoleWidget.window.Element.prototype.getBoundingClientRect = rect as never;
    const dRoleWidget = wRoleWidget.window.document;
    const pRoleWidget = emptyProfile();
    pRoleWidget.basic.gender = '男';
    const roleResult = fillAll(pRoleWidget, dRoleWidget);
    const roleRoot = dRoleWidget.querySelector('#realGenderWidget') as HTMLElement;
    const roleText = roleRoot.querySelector('span') as HTMLElement;
    check(roleResult.items.some((item) => item.field === 'basic.gender' && item.status === 'picker'), '广工大真实 jqx：可见文字 span 通过外层标签识别为性别组件');
    check(roleRoot.getAttribute('data-tui-widget') === 'dropdown' && !roleText.hasAttribute('data-tui-widget'), '广工大真实 jqx：点选标记绑定 role=combobox 根节点而非内层文字 span');
  }
  // ===== 广工大教育页：data-caption 优先，排名百分比/整数名次/同年级人数不得串字段 =====
  {
    const wGdutEducation = new JSDOM(
      '<body>' +
      '<div class="bh-form-group" data-caption="前五学期总评成绩在所学专业同年级的排名（百分比）"><input name="PMBFB"><span>%</span></div>' +
      '<div class="bh-form-group" data-caption="前五学期总评成绩在所学专业同年级的排名（整数）"><input name="SZZYTNJPM"><span>（若无准确排名，可不填）</span></div>' +
      '<div class="bh-form-group" data-caption="所在专业同年级人数"><input name="SZZYTNJRS"></div>' +
      '</body>',
      { url: 'https://ehall.gdut.example.edu.cn/gsapp/education' },
    );
    wGdutEducation.window.Element.prototype.getBoundingClientRect = rect as never;
    const dGdutEducation = wGdutEducation.window.document;
    const pGdutEducation = emptyProfile();
    pGdutEducation.education.className = '软件2101班';
    pGdutEducation.education.major = '软件工程';
    pGdutEducation.education.rank = '12';
    pGdutEducation.education.rankBase = '120';
    const rGdutEducation = fillAll(pGdutEducation, dGdutEducation);
    check((dGdutEducation.querySelector('[name="PMBFB"]') as HTMLInputElement).value === '10', '广工大教育页：排名百分比按 12÷120×100 填写为 10，不误填班级');
    check((dGdutEducation.querySelector('[name="SZZYTNJPM"]') as HTMLInputElement).value === '12', '广工大教育页：整数排名按 SZZYTNJPM 精确识别');
    check((dGdutEducation.querySelector('[name="SZZYTNJRS"]') as HTMLInputElement).value === '120', '广工大教育页：所在专业同年级人数识别为排名基数，不误填专业');
    check(rGdutEducation.items.some((item) => item.field === '#rankPercent' && item.label.includes('百分比')), '广工大教育页：data-caption 覆盖百分号辅助节点并保留真实标签');
  }
  // ===== 广工大学校下拉：先使用 jqx 内置过滤框，再点选虚拟列表结果 =====
  {
    const wGdutSchool = new JSDOM(
      '<body><div class="bh-form-group"><label>所在学校</label><div class="bh-form-readonly-input"><input type="hidden">' +
      '<div id="schoolWidget" role="combobox" class="jqx-widget jqx-dropdownlist-state-normal" data-caption="所在学校" aria-owns="schoolListBox">' +
      '<div class="jqx-dropdownlist-content"><span>请选择...</span></div></div></div></div></body>',
      { url: 'https://ehall.gdut.example.edu.cn/gsapp/school' },
    );
    wGdutSchool.window.Element.prototype.getBoundingClientRect = rect as never;
    const dGdutSchool = wGdutSchool.window.document;
    const schoolWidget = dGdutSchool.querySelector('#schoolWidget') as HTMLElement;
    schoolWidget.addEventListener('click', () => {
      if (dGdutSchool.querySelector('#schoolListBox')) return;
      const listBox = dGdutSchool.createElement('div');
      listBox.id = 'schoolListBox';
      listBox.className = 'jqx-listbox';
      const filter = dGdutSchool.createElement('input');
      filter.className = 'jqx-listbox-filter-input';
      filter.placeholder = '请查找';
      // 广工大实页 jqxListBox 在 keyup 后读取过滤框，而不是监听普通 input/change。
      filter.addEventListener('keyup', () => {
        listBox.querySelectorAll('[role="option"]').forEach((item: Element) => item.remove());
        if (filter.value !== '西安交通大学') return;
        const option = dGdutSchool.createElement('div');
        option.setAttribute('role', 'option');
        option.className = 'jqx-listitem-element jqx-item';
        option.textContent = '西安交通大学';
        option.addEventListener('click', () => {
          (schoolWidget.querySelector('span') as HTMLElement).textContent = '西安交通大学';
          (schoolWidget.parentElement?.querySelector('input[type="hidden"]') as HTMLInputElement).value = '10698';
        });
        listBox.appendChild(option);
      });
      listBox.appendChild(filter);
      dGdutSchool.body.appendChild(listBox);
    });
    const pGdutSchool = emptyProfile();
    pGdutSchool.education.university = '西安交通大学';
    fillAll(pGdutSchool, dGdutSchool);
    const schoolCarrier = dGdutSchool.querySelector('[data-tui-widget="dropdown-value"]') as HTMLInputElement;
    const schoolPick = await pickInPage(dGdutSchool, schoolCarrier, '西安交通大学');
    check(schoolPick === 'picked' && schoolCarrier.value === '10698', '广工大学校下拉：过滤虚拟列表后点选并回读隐藏学校代码');
    const schoolRefill = fillAll(pGdutSchool, dGdutSchool);
    check(!schoolRefill.items.some((item) => item.label === '请查找' || item.issueCode === 'E1101'), '广工大学校下拉：jqx 内部“请查找”过滤框不进入字段报告');
    schoolCarrier.value = '';
    schoolCarrier.removeAttribute('data-tui-value');
    schoolWidget.removeAttribute('data-tui-value');
    (schoolWidget.querySelector('span') as HTMLElement).textContent = '请选择...';
    dGdutSchool.querySelector('#schoolListBox')?.remove();
    const schoolMiss = await pickInPage(dGdutSchool, schoolCarrier, '未收录测试大学');
    check(schoolMiss === 'none', '广工大学校下拉：搜索无候选时收起并返回 none，不阻塞后续本科学制组件');
  }
  // ===== 广工大本科学制：由入学/毕业年月谨慎推导，再走真实组件点选 =====
  {
    const wGdutDuration = new JSDOM(
      '<body><div class="bh-form-group"><label>本科学制</label><div class="bh-form-readonly-input"><input type="hidden">' +
      '<div id="durationWidget" role="combobox" class="jqx-widget jqx-dropdownlist-state-normal" data-caption="本科学制" aria-owns="durationListBox">' +
      '<div class="jqx-dropdownlist-content"><span>请选择...</span></div></div></div></div></body>',
      { url: 'https://ehall.gdut.example.edu.cn/gsapp/duration' },
    );
    wGdutDuration.window.Element.prototype.getBoundingClientRect = rect as never;
    const dGdutDuration = wGdutDuration.window.document;
    const durationWidget = dGdutDuration.querySelector('#durationWidget') as HTMLElement;
    durationWidget.addEventListener('click', () => {
      if (dGdutDuration.querySelector('#durationListBox')) return;
      const listBox = dGdutDuration.createElement('div');
      listBox.id = 'durationListBox';
      listBox.className = 'jqx-listbox';
      for (const label of ['三年制', '四年制', '五年制']) {
        const option = dGdutDuration.createElement('div');
        option.setAttribute('role', 'option');
        option.className = 'jqx-listitem-element jqx-item';
        option.textContent = label;
        option.addEventListener('click', () => {
          (durationWidget.querySelector('span') as HTMLElement).textContent = label;
          (durationWidget.parentElement?.querySelector('input[type="hidden"]') as HTMLInputElement).value = label === '四年制' ? '4' : label;
        });
        listBox.appendChild(option);
      }
      dGdutDuration.body.appendChild(listBox);
    });
    const pGdutDuration = emptyProfile();
    pGdutDuration.education.startDate = '2021-09-01';
    pGdutDuration.education.endDate = '2025-06-30';
    const durationFill = fillAll(pGdutDuration, dGdutDuration);
    const durationItem = durationFill.items.find((item) => item.field === '#studyDuration');
    check(durationItem?.status === 'picker' && durationItem.valuePreview === '四年制', '广工大本科学制：含日的 2021-09-01 至 2025-06-30 谨慎推导为四年制');
    const durationCarrier = dGdutDuration.querySelector('[data-tui-widget="dropdown-value"]') as HTMLInputElement;
    const durationPick = await pickInPage(dGdutDuration, durationCarrier, durationItem?.valuePreview || '');
    check(durationPick === 'picked' && durationCarrier.value === '4', '广工大本科学制：按真实三/四/五年制选项点选四年制并回读代码');
  }
  // ===== 问题码体系：码 + 一句话问题 + 用户该做什么 =====
  {
    check(issueMeta('E1203')?.action.includes('手动') === true, '问题码携带用户该做什么');
    check(formatIssue('E1202').startsWith('[E1202]') && formatIssue('E1202').includes('建议'), '问题码格式化为 [码] 问题 —— 建议');
    check(issueMeta('E9999') === null, '未知问题码不误报');
  }

  // ===== 长文按页面证据字数上限填写（证据不足绝不猜、超限绝不截断） =====
  {
    const wEssay = new JSDOM(
      '<body><table><tr><td>个人陈述（不超过500字）</td><td><textarea name="zl"></textarea></td></tr></table></body>',
    );
    wEssay.window.Element.prototype.getBoundingClientRect = rect as never;
    const dEssay = wEssay.window.document;
    const pEssay = emptyProfile();
    pEssay.essays.push({ kind: '个人陈述', content: '陈述'.repeat(100), charLimit: 0, state: createRowState('manual', 'essay-fit') });
    fillAll(pEssay, dEssay);
    const zl = dEssay.querySelector('[name="zl"]') as HTMLTextAreaElement;
    check(zl.value.length === 200, '长文在页面字数上限内时自动填写');

    const wEssay2 = new JSDOM(
      '<body><table><tr><td>个人陈述（不超过500字）</td><td><textarea name="zl2"></textarea></td></tr></table></body>',
    );
    wEssay2.window.Element.prototype.getBoundingClientRect = rect as never;
    const dEssay2 = wEssay2.window.document;
    const pEssay2 = emptyProfile();
    pEssay2.essays.push({ kind: '个人陈述', content: '超'.repeat(600), charLimit: 0, state: createRowState('manual', 'essay-over') });
    const resEssay2 = fillAll(pEssay2, dEssay2);
    check((dEssay2.querySelector('[name="zl2"]') as HTMLTextAreaElement).value === '', '长文超页面字数上限时不填、不截断');
    check(resEssay2.items.some((i) => i.issueCode === 'E1206' && (i.reason || '').includes('超限')), '超限跳过携带 E1206 与说明');

    const wEssay3 = new JSDOM(
      '<body><table><tr><td>备注</td><td><textarea name="bz"></textarea></td></tr></table></body>',
    );
    wEssay3.window.Element.prototype.getBoundingClientRect = rect as never;
    const dEssay3 = wEssay3.window.document;
    const pEssay3 = emptyProfile();
    pEssay3.essays.push({ kind: '个人陈述', content: '不该写进备注'.repeat(5), charLimit: 0, state: createRowState('manual', 'essay-note') });
    fillAll(pEssay3, dEssay3);
    check((dEssay3.querySelector('[name="bz"]') as HTMLTextAreaElement).value === '', '备注类字段绝不拿个人陈述顶上');
  }

  // ===== 清除本页已填：只清本扩展标记为 filled 的控件 =====
  {
    const wClr = new JSDOM(
      '<body><table><tr><td>姓名</td><td><input name="cn"></td></tr><tr><td>手机</td><td><input name="cp"></td></tr><tr><td>无规则</td><td><input name="cx"></td></tr></table></body>',
    );
    wClr.window.Element.prototype.getBoundingClientRect = rect as never;
    const dClr = wClr.window.document;
    const pClr = emptyProfile();
    pClr.basic.name = '张三';
    pClr.basic.phone = '13800000000';
    fillAll(pClr, dClr);
    check((dClr.querySelector('[name="cn"]') as HTMLInputElement).value === '张三', '清除前字段已自动填写');
    const cleared = clearPageFill(dClr);
    check(cleared >= 2, `清除本页已填返回清空数量（实际 ${cleared}）`);
    check((dClr.querySelector('[name="cn"]') as HTMLInputElement).value === '', '标记为 filled 的字段被清空');
    check((dClr.querySelector('[name="cx"]') as HTMLInputElement).value === '', '无规则字段不受影响');
    check(!dClr.querySelector('[data-tui]'), '清除后高亮标记全部移除');
  }

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

  // V2 安全加行：允许“新增一行”，但绝不借“保存”按钮制造下一行。
  {
    const wSafe = new JSDOM(
      '<body>' +
        '<table id="safeTbl"><tbody><tr><th>学习或工作起止时间</th><th>学习或工作单位名称</th><th>担任职务</th></tr>' +
        '<tr><td><input name="sf0t"></td><td><input name="sf0o"></td><td><input name="sf0r"></td></tr></tbody></table>' +
        '<button id="safeAdd">新增一行</button><button id="safeSave">保存</button></body>',
    );
    const dSafe = wSafe.window.document;
    wSafe.window.Element.prototype.getBoundingClientRect = rect as never;
    let addClicks = 0;
    let saveClicks = 0;
    dSafe.getElementById('safeAdd')!.addEventListener('click', () => {
      addClicks += 1;
      (dSafe.getElementById('safeAdd') as HTMLButtonElement).disabled = true;
      const row = (dSafe.getElementById('safeTbl') as HTMLTableElement).querySelector('tbody')!.insertRow();
      row.innerHTML = '<td><input name="sf1t"></td><td><input name="sf1o"></td><td><input name="sf1r"></td>';
    });
    dSafe.getElementById('safeSave')!.addEventListener('click', () => { saveClicks += 1; });
    const pSafe = emptyProfile();
    pSafe.experiences.push({ start: '2018-09', end: '2021-06', org: '某高中', role: '学生' });
    pSafe.experiences.push({ start: '2021-09', end: '2025-06', org: '某大学', role: '学生' });
    pSafe.experiences.push({ start: '2025-09', end: '2028-06', org: '某研究院', role: '学生' });
    const nSafe = await fillExperiences(pSafe, dSafe, 0, undefined, 3, false);
    check(nSafe === 2 && addClicks === 1, '安全加行：点击“新增一行”并填写下一条');
    check(saveClicks === 0, '安全加行：不会自动点击“保存”');
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

  // 北科大外语水平页：考试等级是 select，必须与同一条成绩和日期成对填写。
  {
    const wUstbLang = new JSDOM(
      '<body><table><tbody><tr><th>外语水平</th><th>成绩</th><th>取得成绩时间（日期格式：2019-11-11）</th><th>备注</th><th>操作</th></tr>' +
        '<tr><td><select id="lbmc0"><option value="">----请选择----</option><option value="4">四级</option><option value="6">六级</option><option value="toefl">托福</option><option value="ielts">雅思</option><option value="other">其它</option></select></td>' +
        '<td><input id="cj0" name="cj"></td><td><input id="sj0" name="sj"></td><td><input id="bz0"></td><td></td></tr>' +
        '</tbody></table></body>',
    );
    wUstbLang.window.Element.prototype.getBoundingClientRect = rect as never;
    const pUstbLang = emptyProfile();
    pUstbLang.languageExams.push({ kind: 'CET-6', score: '518', date: '2025-06', level: '', certificateNo: '', state: createRowState('manual', 'ustb-cet6') });
    fillAll(pUstbLang, wUstbLang.window.document);
    const grade = wUstbLang.window.document.querySelector('#lbmc0') as HTMLSelectElement;
    check(grade.selectedOptions[0]?.text === '六级', '北科大外语水平：英语等级 select 精确选择六级');
    check((wUstbLang.window.document.querySelector('#cj0') as HTMLInputElement).value === '518', '北科大外语水平：六级类型与六级成绩成对填写');
    check((wUstbLang.window.document.querySelector('#sj0') as HTMLInputElement).value === '2025-06-01', '北科大外语水平：取得时间按页面日格式填写');
  }

  // 页面没有 GRE 专项选项时，只能选择“其它”，并在备注保留真实考试名称。
  {
    const wOtherLang = new JSDOM(
      '<body><table><tbody><tr><th>外语水平</th><th>成绩</th><th>取得成绩时间</th><th>备注</th></tr>' +
        '<tr><td><select id="otherKind"><option value="">请选择</option><option>四级</option><option>六级</option><option>托福</option><option>雅思</option><option>其它</option></select></td>' +
        '<td><input id="otherScore"></td><td><input id="otherDate"></td><td><input id="otherNote"></td></tr></tbody></table></body>',
    );
    wOtherLang.window.Element.prototype.getBoundingClientRect = rect as never;
    const pOtherLang = emptyProfile();
    pOtherLang.languageExams.push({ kind: 'GRE', score: '326', date: '2025-04', level: '', certificateNo: '', state: createRowState('manual', 'gre') });
    fillAll(pOtherLang, wOtherLang.window.document);
    check((wOtherLang.window.document.querySelector('#otherKind') as HTMLSelectElement).selectedOptions[0]?.text === '其它', '外语水平：未知考试类型安全回退“其它”');
    check((wOtherLang.window.document.querySelector('#otherNote') as HTMLInputElement).value === 'GRE', '外语水平：“其它”在备注保留真实考试类型');
  }

  // 单行页面通过“新增一行”填写第二项，且四级、六级的成绩不交叉。
  {
    const wLangRows = new JSDOM(
      '<body><div id="langWrap"><table id="langTable"><tbody><tr><th>外语水平</th><th>成绩</th><th>取得成绩时间</th><th>备注</th><th>操作</th></tr>' +
        '<tr><td><select><option value="">请选择</option><option>四级</option><option>六级</option></select></td><td><input></td><td><input></td><td><input></td><td></td></tr>' +
        '</tbody></table><button id="addLang">新增一行</button></div></body>',
    );
    wLangRows.window.Element.prototype.getBoundingClientRect = rect as never;
    const dLangRows = wLangRows.window.document;
    dLangRows.querySelector('#addLang')?.addEventListener('click', () => {
      const row = (dLangRows.querySelector('#langTable') as HTMLTableElement).insertRow();
      row.innerHTML = '<td><select><option value="">请选择</option><option>四级</option><option>六级</option></select></td><td><input></td><td><input></td><td><input></td><td></td>';
    });
    const pLangRows = emptyProfile();
    pLangRows.languageExams.push(
      { kind: 'CET-6', score: '510', date: '2025-06', level: '', certificateNo: '', state: createRowState('manual', 'cet6-row') },
      { kind: 'CET-4', score: '560', date: '2023-06', level: '', certificateNo: '', state: createRowState('manual', 'cet4-row') },
    );
    const languageFilled = await fillLanguageExams(pLangRows, dLangRows);
    const languageRows = Array.from((dLangRows.querySelector('#langTable') as HTMLTableElement).rows).slice(1);
    check(languageFilled === 2 && languageRows.length === 2, '外语水平：安全点击“新增一行”并填写两条考试');
    check((languageRows[0].cells[0].querySelector('select') as HTMLSelectElement).selectedOptions[0]?.text === '六级' && (languageRows[0].cells[1].querySelector('input') as HTMLInputElement).value === '510', '外语水平：六级与 510 保持同一原子记录');
    check((languageRows[1].cells[0].querySelector('select') as HTMLSelectElement).selectedOptions[0]?.text === '四级' && (languageRows[1].cells[1].querySelector('input') as HTMLInputElement).value === '560', '外语水平：四级与 560 保持同一原子记录');
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
  // ===== 学校/专业代码名称精确绑定 =====
  {
    const pairs = w.document.createElement('div');
    pairs.innerHTML =
      '<div id="schoolPair"><input name="txtBkbydwm" type="hidden" value="10698"><input name="txtBkbydwmc" value="西安交通大学"><input name="schoolShow"></div>' +
      '<div id="majorPair"><input name="txtBkzydm" type="hidden" value="080901"><input name="txtBkzymc" value="计算机科学与技术"><input name="majorShow"></div>';
    w.document.body.appendChild(pairs);
    const schoolAnchor = pairs.querySelector('[name="schoolShow"]') as HTMLInputElement;
    const majorAnchor = pairs.querySelector('[name="majorShow"]') as HTMLInputElement;
    const schoolBinding = resolveCodeNameBinding(w.document, schoolAnchor, { profilePath: 'education.university' });
    const majorBinding = resolveCodeNameBinding(w.document, majorAnchor, { profilePath: 'education.major' });
    check(!!schoolBinding && schoolBinding.code.name === 'txtBkbydwm' && schoolBinding.name.name === 'txtBkbydwmc', '弹窗精确绑定：本科院校只绑定自己的代码/名称框');
    check(!!majorBinding && majorBinding.code.name === 'txtBkzydm' && majorBinding.name.name === 'txtBkzymc', '弹窗精确绑定：本科专业不串到院校代码/名称框');
    check(!!majorBinding && verifyCodeNameBinding(majorBinding, '计算机科学与技术', { codeAliases: ['080605', '080901'] }), '专业新旧目录代码别名：任一允许代码匹配即可');
    if (majorBinding) majorBinding.name.value = '';
    check(!!majorBinding && !verifyCodeNameBinding(majorBinding, '计算机科学与技术'), '弹窗回读：只有代码没有名称时拒绝判定成功');
    pairs.remove();
  }

  // ===== 分组件日期驱动 =====
  {
    const dateWrap = w.document.createElement('div');
    dateWrap.innerHTML =
      '<input id="nativeMonth" type="month">' +
      '<input id="my97Month" class="Wdate" readonly placeholder="yyyyMM">' +
      '<span class="ant-picker"><input id="antDate" placeholder="YYYY-MM-DD"></span>' +
      '<div class="bhtc-input-group" xtype="date-ym" data-caption="入学年月" data-name="BKRXNY"><input id="bhtcMonth"></div>';
    w.document.body.appendChild(dateWrap);
    const nativeMonth = dateWrap.querySelector('#nativeMonth') as HTMLInputElement;
    const my97Month = dateWrap.querySelector('#my97Month') as HTMLInputElement;
    const antDate = dateWrap.querySelector('#antDate') as HTMLInputElement;
    const bhtcMonth = dateWrap.querySelector('#bhtcMonth') as HTMLInputElement;
    const nativeResult = fillDateControl(nativeMonth, '2025-06-18');
    const my97Result = fillDateControl(my97Month, '2021-09');
    antDate.addEventListener('blur', () => setTimeout(() => { antDate.value = '2026-08-27'; }, 20), { once: true });
    const antResult = fillDateControl(antDate, '2003-05-12');
    const bhtcResult = fillDateControl(bhtcMonth, '2021-09');
    check(nativeResult.ok && nativeMonth.value === '2025-06', '日期驱动：原生 month 控件按 YYYY-MM 写入');
    check(my97Result.ok && my97Result.driver === 'my97' && my97Month.value === '202109', '日期驱动：My97 年月框按 yyyyMM 写入并回读');
    check(antResult.ok && antResult.driver === 'ant', '日期驱动：识别 Ant DatePicker 并完成首次模型事件写入');
    check(bhtcResult.ok && bhtcResult.driver === 'bhtc' && bhtcMonth.value === '2021-09', '日期驱动：博思 date-ym 不受“入学年月”标题干扰，按 YYYY-MM 写入');
    const declaredWdate = w.document.createElement('input');
    declaredWdate.className = 'Wdate';
    declaredWdate.setAttribute('onclick', "WdatePicker({dateFmt:'yyyyMM'})");
    const declaredWdateResult = fillDateControl(declaredWdate, '2022-09');
    check(declaredWdateResult.ok && declaredWdate.value === '202209', '日期驱动：优先解析页面 WdatePicker dateFmt=yyyyMM');
    const strictWdate = w.document.createElement('input');
    strictWdate.addEventListener('change', () => { strictWdate.value = '2022-09'; }, { once: true });
    const strictWdateResult = fillDateControl(strictWdate, '2022-09', { precision: 'month', format: 'yyyyMM' });
    check(!strictWdateResult.ok, '日期驱动：日期含义相同但字符串格式不符时不得误报回读成功');
    await sleep(500);
    check(antDate.value === '2003-05-12', '日期驱动：组件失焦异步重置后自动恢复档案日期');
    dateWrap.remove();
  }

  // 北科大蓝色系统 rxny/byny 的真实契约是紧凑 yyyyMM，不是 YYYY-MM。
  {
    const ustbDates = new JSDOM(
      '<input id="bkbydwShow"><input id="bkbyzyShow"><input id="rxny" class="Wdate" readonly><input id="byny" class="Wdate" readonly>',
      { url: 'https://yjsy.ustb.edu.cn/ksxt/ssxly/example' },
    );
    const ustbProfile = emptyProfile();
    ustbProfile.education.startDate = '2022-09';
    ustbProfile.education.endDate = '2026-06';
    const ustbAdapter = matchAdapterPackage(ustbDates.window.location.href)!;
    const dateResults = fillAdapterContract(ustbProfile, ustbDates.window.document, ustbDates.window.location.href, ustbAdapter);
    check((ustbDates.window.document.getElementById('rxny') as HTMLInputElement).value === '202209', '北科大日期契约：入学年月写为 yyyyMM');
    check((ustbDates.window.document.getElementById('byny') as HTMLInputElement).value === '202606', '北科大日期契约：预计毕业年月写为 yyyyMM');
    check(dateResults.filter((item) => /education\.(startDate|endDate)/.test(item.profilePath) && item.status === 'filled').length === 2, '北科大日期契约：两项均通过严格格式回读');
  }

  // ===== 三个独立内核：简约系统院校/专业专项流程 =====
  {
    const minimal = w.document.createElement('div');
    minimal.innerHTML =
      '<input id="txtBkbydwm" type="hidden"><input id="txtBkbydwmc"><a id="hykSelBkBydw">选择学校</a>' +
      '<input id="txtBkzydm" type="hidden"><input id="txtBkzymc"><a id="hykSelBkzydm">选择专业</a>';
    w.document.body.appendChild(minimal);

    const schoolFrame = w.document.createElement('iframe');
    schoolFrame.name = 'SelUniversity';
    w.document.body.appendChild(schoolFrame);
    const schoolDoc = schoolFrame.contentDocument as Document;
    if (schoolDoc.defaultView) (schoolDoc.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    schoolDoc.body.innerHTML =
      '<input id="txtWord"><button>查询</button><table><tr><td>10698</td><td>西安交通大学</td><td><button id="chooseSchool">选择</button></td></tr></table>';
    schoolDoc.querySelector('#chooseSchool')?.addEventListener('click', () => {
      (minimal.querySelector('#txtBkbydwm') as HTMLInputElement).value = '10698';
      (minimal.querySelector('#txtBkbydwmc') as HTMLInputElement).value = '西安交通大学';
    });
    const schoolStatus = await pickSchool(w.document, minimal.querySelector('#txtBkbydwmc')!, '西安交通大学', { codeAliases: ['10698'] });
    check(schoolStatus === 'picked', '院校独立内核：SelUniversity 查询、选择及代码名称回读完成');

    const majorFrame = w.document.createElement('iframe');
    majorFrame.name = 'SelBkdzZydm';
    w.document.body.appendChild(majorFrame);
    const majorDoc = majorFrame.contentDocument as Document;
    if (majorDoc.defaultView) (majorDoc.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    majorDoc.body.innerHTML =
      '<select><option>请选择</option><option>哲学</option><option>经济学</option><option>法学</option><option>理学</option><option value="g">工学</option></select>' +
      '<input id="txtWord"><button>查询</button><table><tr><td>080901</td><td>计算机科学与技术</td><td><button id="chooseMajor">选择</button></td></tr></table>';
    majorDoc.querySelector('#chooseMajor')?.addEventListener('click', () => {
      (minimal.querySelector('#txtBkzydm') as HTMLInputElement).value = '080901';
      (minimal.querySelector('#txtBkzymc') as HTMLInputElement).value = '计算机科学与技术';
    });
    const majorStatus = await pickMajor(w.document, minimal.querySelector('#txtBkzymc')!, '计算机科学与技术', { codeAliases: ['080605'] });
    check(majorStatus === 'picked', '专业独立内核：SelBkdzZydm 门类、查询、新旧代码及名称回读完成');
    check((majorDoc.querySelector('select') as HTMLSelectElement).value === 'g', '专业独立内核：按专业名称自动选择工学门类');
    schoolFrame.remove();
    majorFrame.remove();
    minimal.remove();
  }

  // ===== 蓝色系统学校/专业三联协议（北科大真实字段名） =====
  {
    const blue = w.document.createElement('div');
    blue.innerHTML =
      '<div><input id="bydwm" type="hidden"><input id="bydw" type="hidden"><input id="bkbydwShow"><span id="chooseSch" class="addon">选择</span></div>' +
      '<div><input id="byzydm" type="hidden"><input id="byzymc" type="hidden"><input id="bkbyzyShow"><span id="chooseZy" class="addon">选择</span></div>';
    w.document.body.appendChild(blue);

    const schoolFrame = w.document.createElement('iframe');
    schoolFrame.name = 'chooseSch';
    w.document.body.appendChild(schoolFrame);
    const schoolDoc = schoolFrame.contentDocument as Document;
    if (schoolDoc.defaultView) (schoolDoc.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    schoolDoc.body.innerHTML =
      '<input id="key"><button>查询</button><table><tr><td>10698</td><td>西安交通大学</td><td><span id="schoolRow" onclick="void(0)">选择</span></td></tr></table>';
    schoolDoc.querySelector('#schoolRow')?.addEventListener('click', () => {
      (blue.querySelector('#bydwm') as HTMLInputElement).value = '10698';
      (blue.querySelector('#bydw') as HTMLInputElement).value = '西安交通大学';
      (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '10698 西安交通大学';
    });
    const schoolStatus = await pickSchool(w.document, blue.querySelector('#bkbydwShow')!, '西安交通大学', {
      pickerProtocol: 'blue-flat',
      codeSelectors: ['#bydwm'], nameSelectors: ['#bydw'], displaySelectors: ['#bkbydwShow'],
      triggerSelectors: ['#chooseSch'], frameNames: ['chooseSch'],
    });
    check(schoolStatus === 'picked' && (blue.querySelector('#bkbydwShow') as HTMLInputElement).value === '10698 西安交通大学', '蓝色三联学校：chooseSch 的 span 结果行点选后代码、名称、展示完整回读');
    schoolFrame.remove();

    // 北科大 chooseSch 实际采用省份 → 学校级联，而不是固定的查询结果表。
    (blue.querySelector('#bydwm') as HTMLInputElement).value = '';
    (blue.querySelector('#bydw') as HTMLInputElement).value = '';
    (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '';
    const cascadeDialog = w.document.createElement('div');
    cascadeDialog.className = 'bh-dialog';
    cascadeDialog.innerHTML =
      '<select id="schoolProvince"><option value="">请选择省份</option><option value="11">北京市</option><option value="31">上海市</option><option value="61">陕西省</option></select>' +
      '<select id="schoolList"><option value="">请选择学校</option></select><button id="schoolConfirm">确定</button>';
    w.document.body.appendChild(cascadeDialog);
    const provinceSelect = cascadeDialog.querySelector('#schoolProvince') as HTMLSelectElement;
    const schoolSelect = cascadeDialog.querySelector('#schoolList') as HTMLSelectElement;
    provinceSelect.addEventListener('change', () => {
      if (provinceSelect.value === '61') schoolSelect.innerHTML = '<option value="">请选择学校</option><option value="61|10698|西安交通大学">西安交通大学</option>';
    });
    const cascadeStatus = await pickSchool(w.document, blue.querySelector('#bkbydwShow')!, '西安交通大学', {
      profilePath: 'education.university', pickerProtocol: 'blue-flat', cascadeLabels: ['陕西'],
      codeSelectors: ['#bydwm'], nameSelectors: ['#bydw'], displaySelectors: ['#bkbydwShow'], triggerSelectors: ['#chooseSch'],
    });
    check(cascadeStatus === 'picked' && provinceSelect.value === '61' && schoolSelect.value === '61|10698|西安交通大学', '蓝色三联学校：在普通对话框中按省份和院校逐级精确选择');
    check((blue.querySelector('#bydwm') as HTMLInputElement).value === '10698' && (blue.querySelector('#bydw') as HTMLInputElement).value === '西安交通大学', '蓝色三联学校：级联选项的代码、名称和展示框完整回读');
    const safeBlueDebug = w.sessionStorage.getItem('tui-pick-debug') || '';
    check(safeBlueDebug.includes('cascade-parent') && safeBlueDebug.includes('cascade-leaf') && !safeBlueDebug.includes('西安交通大学'), '蓝色三联学校：诊断记录级联阶段且不包含真实院校名称');

    (blue.querySelector('#bydwm') as HTMLInputElement).value = '';
    (blue.querySelector('#bydw') as HTMLInputElement).value = '';
    (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '';
    provinceSelect.value = '';
    schoolSelect.innerHTML = '<option value="">请选择学校</option>';
    const noProvinceStatus = await pickSchool(w.document, blue.querySelector('#bkbydwShow')!, '西安交通大学', {
      profilePath: 'education.university', pickerProtocol: 'blue-flat',
      codeSelectors: ['#bydwm'], nameSelectors: ['#bydw'], displaySelectors: ['#bkbydwShow'], triggerSelectors: ['#chooseSch'],
    });
    check(noProvinceStatus === 'picked' && provinceSelect.value === '61' && schoolSelect.value === '61|10698|西安交通大学', '蓝色三联学校：档案未填省份时可在弹窗内逐省定位院校');
    check((w.sessionStorage.getItem('tui-pick-debug') || '').includes('cascade-parent-scan'), '蓝色三联学校：无省份兜底过程留下非敏感诊断');
    cascadeDialog.remove();

    // Edge 下蓝色系统搜索结果可能只有裸 img 图标；必须执行元素自身 click 激活动作。
    (blue.querySelector('#bydwm') as HTMLInputElement).value = '';
    (blue.querySelector('#bydw') as HTMLInputElement).value = '';
    (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '';
    const imageFrame = w.document.createElement('iframe');
    imageFrame.name = 'SelUniversity';
    w.document.body.appendChild(imageFrame);
    const imageDoc = imageFrame.contentDocument as Document;
    if (imageDoc.defaultView) (imageDoc.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    imageDoc.body.innerHTML =
      '<input id="txtWord"><button id="btSearch">查询</button><table><tr><td>10190</td><td>长春工业大学</td><td><img id="rawSchoolImage" src="select.gif" alt=""></td></tr></table>';
    imageDoc.querySelector('#rawSchoolImage')?.addEventListener('click', () => {
      (blue.querySelector('#bydwm') as HTMLInputElement).value = '10190';
      (blue.querySelector('#bydw') as HTMLInputElement).value = '长春工业大学';
      (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '10190 长春工业大学';
    });
    const rawImageStatus = await pickSchool(w.document, blue.querySelector('#bkbydwShow')!, '长春工业大学', {
      profilePath: 'education.university', pickerProtocol: 'blue-flat',
      codeSelectors: ['#bydwm'], nameSelectors: ['#bydw'], displaySelectors: ['#bkbydwShow'], frameNames: ['SelUniversity'],
    });
    check(rawImageStatus === 'picked' && (blue.querySelector('#bydwm') as HTMLInputElement).value === '10190', '蓝色三联学校：Edge 搜索结果行的裸 img 选择按钮可被真正激活');
    imageFrame.remove();

    // 非表格结果：搜索后出现 li/span 学校项，点击其上级 onclick 完成选择。
    (blue.querySelector('#bydwm') as HTMLInputElement).value = '';
    (blue.querySelector('#bydw') as HTMLInputElement).value = '';
    (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '';
    const listFrame = w.document.createElement('iframe');
    listFrame.name = 'SelUniversity';
    w.document.body.appendChild(listFrame);
    const listDoc = listFrame.contentDocument as Document;
    if (listDoc.defaultView) (listDoc.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    listDoc.body.innerHTML =
      '<input id="txtWord"><button id="btSearch">查询</button><ul><li id="schoolListItem" data-code="10700" onclick="void(0)"><span>10700 西安理工大学</span></li></ul>';
    listDoc.querySelector('#schoolListItem')?.addEventListener('click', () => {
      (blue.querySelector('#bydwm') as HTMLInputElement).value = '10700';
      (blue.querySelector('#bydw') as HTMLInputElement).value = '西安理工大学';
      (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '10700 西安理工大学';
    });
    const listNodeStatus = await pickSchool(w.document, blue.querySelector('#bkbydwShow')!, '西安理工大学', {
      profilePath: 'education.university', pickerProtocol: 'blue-flat',
      codeSelectors: ['#bydwm'], nameSelectors: ['#bydw'], displaySelectors: ['#bkbydwShow'], frameNames: ['SelUniversity'],
    });
    check(listNodeStatus === 'picked' && (blue.querySelector('#bydwm') as HTMLInputElement).value === '10700', '蓝色三联学校：非表格 li/span 搜索结果可以精确选中');
    listFrame.remove();

    // 北科大真实结构：结果在 universitySelectPage iframe 内，Layui“确定”在承载 iframe 的父弹层中。
    (blue.querySelector('#bydwm') as HTMLInputElement).value = '';
    (blue.querySelector('#bydw') as HTMLInputElement).value = '';
    (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '';
    const unrelatedConfirm = w.document.createElement('button');
    unrelatedConfirm.textContent = '确定';
    let unrelatedConfirmClicks = 0;
    unrelatedConfirm.addEventListener('click', () => { unrelatedConfirmClicks += 1; });
    w.document.body.appendChild(unrelatedConfirm);
    const ustbLayer = w.document.createElement('div');
    ustbLayer.className = 'layui-layer layui-layer-iframe';
    ustbLayer.innerHTML =
      '<div class="layui-layer-content"></div>' +
      '<div class="layui-layer-btn"><a class="layui-layer-btn0">确定</a><a class="layui-layer-btn1">清除</a><a class="layui-layer-btn2">关闭</a></div>';
    w.document.body.appendChild(ustbLayer);
    const ustbFrame = w.document.createElement('iframe');
    ustbFrame.name = 'SelUniversity';
    ustbLayer.querySelector('.layui-layer-content')?.appendChild(ustbFrame);
    const ustbDoc = ustbFrame.contentDocument as Document;
    if (ustbDoc.defaultView) (ustbDoc.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    ustbDoc.body.innerHTML =
      '<input id="keyword"><input id="qt"><button>搜索</button>' +
      '<a class="province-item">陕西省</a><a id="ustbSchool" class="university-item">西安理工大学</a>';
    const ustbSchool = ustbDoc.querySelector('#ustbSchool') as HTMLElement;
    ustbSchool.addEventListener('click', () => ustbSchool.classList.add('choosen'));
    let layerConfirmClicks = 0;
    ustbLayer.querySelector('.layui-layer-btn0')?.addEventListener('click', () => {
      layerConfirmClicks += 1;
      if (!ustbSchool.classList.contains('choosen')) return;
      (blue.querySelector('#bydwm') as HTMLInputElement).value = '10700';
      (blue.querySelector('#bydw') as HTMLInputElement).value = '西安理工大学';
      (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '10700 西安理工大学';
    });
    const ustbLayerStatus = await pickSchool(w.document, blue.querySelector('#bkbydwShow')!, '西安理工大学', {
      profilePath: 'education.university', pickerProtocol: 'blue-flat', expectedCode: '10700',
      codeSelectors: ['#bydwm'], nameSelectors: ['#bydw'], displaySelectors: ['#bkbydwShow'], frameNames: ['SelUniversity'],
    });
    check(ustbLayerStatus === 'picked' && layerConfirmClicks === 1, '蓝色三联学校：选中 iframe 内院校后点击所属 Layui 弹层的确定按钮');
    check(unrelatedConfirmClicks === 0, '蓝色三联学校：不会误点当前选择器弹层之外的同名确定按钮');
    check((w.sessionStorage.getItem('tui-pick-debug') || '').includes('layer-confirm'), '蓝色三联学校：诊断记录包含跨 iframe 弹层确认阶段');
    ustbLayer.remove();
    unrelatedConfirm.remove();

    const staleSchoolFrame = w.document.createElement('iframe');
    staleSchoolFrame.name = 'SelUniversity';
    w.document.body.appendChild(staleSchoolFrame);
    const staleSchoolDoc = staleSchoolFrame.contentDocument as Document;
    if (staleSchoolDoc.defaultView) (staleSchoolDoc.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    staleSchoolDoc.body.innerHTML = '<input id="staleSchoolSearch"><button>查询</button><table><tr><td>10700 西安理工大学</td></tr></table>';

    const majorFrame = w.document.createElement('iframe');
    majorFrame.name = 'SelBkdzZydm';
    w.document.body.appendChild(majorFrame);
    const majorDoc = majorFrame.contentDocument as Document;
    if (majorDoc.defaultView) (majorDoc.defaultView as any).Element.prototype.getBoundingClientRect = rect;
    majorDoc.body.innerHTML =
      '<input id="key"><button>查询</button><table><tr><td>080301</td><td>测控技术与仪器</td><td onclick="void(0)" id="majorRow">选择</td></tr></table>';
    majorDoc.querySelector('#majorRow')?.addEventListener('click', () => {
      (blue.querySelector('#byzydm') as HTMLInputElement).value = '080301';
      (blue.querySelector('#byzymc') as HTMLInputElement).value = '测控技术与仪器';
      (blue.querySelector('#bkbyzyShow') as HTMLInputElement).value = '080301 测控技术与仪器';
    });
    const majorStatus = await pickMajor(w.document, blue.querySelector('#bkbyzyShow')!, '测控技术与仪器', {
      pickerProtocol: 'blue-flat',
      codeSelectors: ['#byzydm'], nameSelectors: ['#byzymc'], displaySelectors: ['#bkbyzyShow'],
      triggerSelectors: ['#chooseZy'], frameNames: ['chooseZy', 'SelBkdzZydm'],
    });
    check(majorStatus === 'picked' && (blue.querySelector('#byzydm') as HTMLInputElement).value === '080301' && (blue.querySelector('#byzymc') as HTMLInputElement).value === '测控技术与仪器', '蓝色三联专业：chooseZy 的 td onclick 结果行点选后不再只填展示框');
    check((staleSchoolDoc.querySelector('#staleSchoolSearch') as HTMLInputElement).value === '', '蓝色三联隔离：专业关键字不会写入遗留的 SelUniversity 院校弹窗');
    staleSchoolFrame.remove();
    majorFrame.remove();

    // 合工大教育步骤回归（E2E 曾失败）：扩展面板运行日志文案含"选择"且命中 [class*="panel"]，
    // 不得被误判成已打开的选择器弹层——触发按钮必须被真正点击，页内 layui 弹窗的行内「选择」完成三联回读。
    (blue.querySelector('#bydwm') as HTMLInputElement).value = '';
    (blue.querySelector('#bydw') as HTMLInputElement).value = '';
    (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '';
    const fakePanel = w.document.createElement('div');
    fakePanel.id = 'tui-panel';
    fakePanel.textContent = '弹窗选择框：将按当前字段精确匹配代码和名称';
    w.document.body.appendChild(fakePanel);
    const hfutDialog = w.document.createElement('div');
    hfutDialog.id = 'hfutSchoolDialog';
    hfutDialog.className = 'layui-layer';
    hfutDialog.style.display = 'none';
    hfutDialog.innerHTML = '<input type="text"><button>查询</button><table><tr><td>10700</td><td>西安理工大学</td><td><button id="chooseHfutSchool">选择</button></td></tr></table>';
    w.document.body.appendChild(hfutDialog);
    blue.querySelector('#chooseSch')!.addEventListener('click', () => {
      hfutDialog.style.display = 'block';
    });
    hfutDialog.querySelector('#chooseHfutSchool')?.addEventListener('click', () => {
      (blue.querySelector('#bydwm') as HTMLInputElement).value = '10700';
      (blue.querySelector('#bydw') as HTMLInputElement).value = '西安理工大学';
      (blue.querySelector('#bkbydwShow') as HTMLInputElement).value = '10700 西安理工大学';
      hfutDialog.style.display = 'none';
    });
    const hfutEduStatus = await pickSchool(w.document, blue.querySelector('#bkbydwShow')!, '西安理工大学', {
      profilePath: 'education.university', pickerProtocol: 'blue-flat',
      codeSelectors: ['#bydwm'], nameSelectors: ['#bydw'], displaySelectors: ['#bkbydwShow'],
      triggerSelectors: ['#bkbydwShow + span.addon'],
    });
    check(hfutEduStatus === 'picked' && (blue.querySelector('#bydwm') as HTMLInputElement).value === '10700' && (blue.querySelector('#bkbydwShow') as HTMLInputElement).value === '10700 西安理工大学', '合工大教育步骤：扩展面板不误判为选择器弹层，页内弹窗行内「选择」完成三联回读');
    check((fakePanel.querySelector('input')) === null, '合工大教育步骤：关键字不会误写入扩展面板');
    fakePanel.remove();
    hfutDialog.remove();

    blue.remove();
  }

  // ===== Ant / Select2 / Element / Layui 专用组件驱动 =====
  {
    const components = w.document.createElement('div');
    components.innerHTML =
      '<select id="s2Model"><option value="">请选择</option><option value="10698">西安交通大学</option></select>' +
      '<span class="select2-container"><span class="select2-selection"><span class="select2-selection__rendered">请选择</span></span></span>' +
      '<div class="select2-dropdown"><input class="select2-search__field"><ul><li class="select2-results__option" data-value="10698">西安交通大学</li></ul></div>' +
      '<div class="ant-select"><div class="ant-select-selector"><input class="ant-select-selection-search-input"><span class="ant-select-selection-item"></span></div></div>' +
      '<div class="ant-select-dropdown"><div class="ant-select-item-option" data-value="080901"><span class="ant-select-item-option-content">计算机科学与技术</span></div></div>' +
      '<div class="el-select"><div class="el-select__wrapper"><input class="el-input__inner"><span class="el-select__selected-item"></span></div></div>' +
      '<div class="el-select-dropdown"><div class="el-select-dropdown__item">西安交通大学</div></div>' +
      '<select id="layuiModel"><option value="">请选择</option><option value="080901">计算机科学与技术</option></select>' +
      '<div class="layui-form-select"><div class="layui-select-title"><input></div><dl class="layui-anim-upbit"><dd lay-value="080901">计算机科学与技术</dd></dl></div>';
    w.document.body.appendChild(components);
    const s2Model = components.querySelector('#s2Model') as HTMLSelectElement;
    components.querySelector('.select2-results__option')?.addEventListener('click', () => {
      s2Model.value = '10698';
      (components.querySelector('.select2-selection__rendered') as HTMLElement).textContent = '西安交通大学';
    });
    const antRoot = components.querySelector('.ant-select') as HTMLElement;
    components.querySelector('.ant-select-item-option')?.addEventListener('click', (event: Event) => {
      (antRoot.querySelector('.ant-select-selection-item') as HTMLElement).textContent = '计算机科学与技术';
      (event.currentTarget as HTMLElement).classList.add('ant-select-item-option-selected');
    });
    const elRoot = components.querySelector('.el-select') as HTMLElement;
    components.querySelector('.el-select-dropdown__item')?.addEventListener('click', () => {
      (elRoot.querySelector('.el-input__inner') as HTMLInputElement).value = '西安交通大学';
      (elRoot.querySelector('.el-select__selected-item') as HTMLElement).textContent = '西安交通大学';
    });
    const layuiModel = components.querySelector('#layuiModel') as HTMLSelectElement;
    components.querySelector('dd[lay-value]')?.addEventListener('click', (event: Event) => {
      layuiModel.value = '080901';
      (components.querySelector('.layui-form-select input') as HTMLInputElement).value = '计算机科学与技术';
      (event.currentTarget as HTMLElement).classList.add('layui-this');
    });
    const s2 = await pickComponentOption(s2Model, '西安交通大学', { componentDriver: 'select2', expectedCode: '10698' });
    const ant = await pickComponentOption(antRoot, '计算机科学与技术', { componentDriver: 'ant', expectedCode: '080901' });
    const element = await pickComponentOption(elRoot, '西安交通大学', { componentDriver: 'element' });
    const layui = await pickComponentOption(components.querySelector('.layui-form-select')!, '计算机科学与技术', { componentDriver: 'layui', expectedCode: '080901' });
    check(s2.status === 'picked' && s2Model.value === '10698', 'Select2 驱动：可见标签与原生 select 模型共同回读');
    check(ant.status === 'picked', 'Ant Select 驱动：搜索、点选和选中标签回读');
    check(element.status === 'picked', 'Element Select 驱动：展开、点选和可见模型回读');
    check(layui.status === 'picked' && layuiModel.value === '080901', 'Layui Select 驱动：dd 选项与底层 select 模型共同回读');
    components.remove();
  }

  // ===== 日期独立内核：真实面板交互 + 隐藏模型完整回读 =====
  {
    const datePanelWrap = w.document.createElement('div');
    datePanelWrap.innerHTML =
      '<span class="ant-picker"><input id="panelDate" placeholder="YYYY-MM-DD"></span><input id="panelHidden" type="hidden">' +
      '<div class="ant-picker-dropdown"><div class="ant-picker-header-view">2025年6月</div><table><tr><td id="day18">18</td></tr></table></div>';
    w.document.body.appendChild(datePanelWrap);
    const panelDate = datePanelWrap.querySelector('#panelDate') as HTMLInputElement;
    const panelHidden = datePanelWrap.querySelector('#panelHidden') as HTMLInputElement;
    datePanelWrap.querySelector('#day18')?.addEventListener('click', () => {
      panelDate.value = '2025-06-18';
      panelHidden.value = '2025-06-18';
    });
    const fullDate = await fillDateControlAsync(panelDate, '2025-06-18', { precision: 'day', hiddenValueSelectors: ['#panelHidden'] });
    check(fullDate.ok && panelHidden.value === '2025-06-18', '日期独立内核：操作真实日期面板并完成可见值、隐藏模型、错误状态回读');
    datePanelWrap.remove();
  }
  // ===== 博思 BHTC 年月面板：日视图 → 年视图 → 月视图，并回读隐藏模型 =====
  {
    const bhtcWrap = w.document.createElement('div');
    bhtcWrap.innerHTML =
      '<div class="bhtc-input-group" xtype="date-ym" data-caption="入学年月"><input id="bhtcPanelInput"></div>' +
      '<input id="bhtcPanelHidden" type="hidden">' +
      '<div class="bhtc-datetimepicker-widget">' +
      '<div class="bhtc-datepicker-days"><span class="bhtc-picker-switch">2026年8月</span></div>' +
      '<div class="bhtc-datepicker-months" style="display:none"><span class="bhtc-picker-switch">2026</span><span class="month" data-action="selectMonth">9月</span></div>' +
      '<div class="bhtc-datepicker-years" style="display:none"><span class="year" data-action="selectYear">2021</span></div>' +
      '</div>';
    w.document.body.appendChild(bhtcWrap);
    const bhtcInput = bhtcWrap.querySelector('#bhtcPanelInput') as HTMLInputElement;
    const bhtcHidden = bhtcWrap.querySelector('#bhtcPanelHidden') as HTMLInputElement;
    const days = bhtcWrap.querySelector('.bhtc-datepicker-days') as HTMLElement;
    const months = bhtcWrap.querySelector('.bhtc-datepicker-months') as HTMLElement;
    const years = bhtcWrap.querySelector('.bhtc-datepicker-years') as HTMLElement;
    days.querySelector('.bhtc-picker-switch')?.addEventListener('click', () => { days.style.display = 'none'; months.style.display = 'block'; });
    months.querySelector('.bhtc-picker-switch')?.addEventListener('click', () => { months.style.display = 'none'; years.style.display = 'block'; });
    years.querySelector('[data-action="selectYear"]')?.addEventListener('click', () => { years.style.display = 'none'; months.style.display = 'block'; });
    months.querySelector('[data-action="selectMonth"]')?.addEventListener('click', () => { bhtcInput.value = '2021-09'; bhtcHidden.value = '2021-09'; });
    const bhtcPanelResult = await fillDateControlAsync(bhtcInput, '2021-09', { precision: 'month', hiddenValueSelectors: ['#bhtcPanelHidden'] });
    check(bhtcPanelResult.ok && bhtcHidden.value === '2021-09', '博思日期驱动：真实选择年份和月份后，可见值与隐藏模型均回读一致');
    bhtcWrap.remove();
  }

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

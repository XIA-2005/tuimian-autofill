// 数据化学校适配包。这里只保存声明式页面契约；所有可执行逻辑都留在扩展内核。

import { AdapterCapabilities, AdapterFieldContract, AdapterPageContract, SchoolAdapterPackage, SupportStatus, declarativeMatchUrl } from './adapters';

const exp = (overrides: Partial<AdapterCapabilities> = {}): AdapterCapabilities => ({
  registerFill: 'directory', formFill: 'experimental', pluginExtract: 'experimental', sessionCrawl: 'directory', ...overrides,
});

const page = (id: string, name: string, role: AdapterPageContract['role'], pathPatterns: string[], requiredSelectors: string[] = []): AdapterPageContract => ({ id, name, role, pathPatterns, requiredSelectors });

const pkg = (
  id: string,
  schoolName: string,
  programName: string,
  family: SchoolAdapterPackage['family'],
  hosts: string[],
  pathPatterns: string[],
  pages: AdapterPageContract[],
  crawl: SchoolAdapterPackage['crawl'],
  capabilities: AdapterCapabilities = exp(),
  projectionPolicy = 'default',
  commitPolicy: SchoolAdapterPackage['commitPolicy'] = 'manual-save-only',
): SchoolAdapterPackage => ({
  schemaVersion: 1,
  id,
  version: '2026.08.27.1',
  minCoreVersion: '2.0.0',
  schoolName,
  programName,
  family,
  match: { hosts, pathPatterns },
  capabilities,
  pages,
  crawl,
  projectionPolicy,
  codeNamespaces: [`adapter:${id}`, 'moe.school', 'moe.major'],
  commitPolicy,
});

const FORM_SHELL_BLOCKS = ['*login*', '*signin*', '*register*', '*reset*', '*print*', '*result*', '*upload*'];

const commonSchoolMajorDateFields = (componentDriver?: AdapterFieldContract['componentDriver']): AdapterFieldContract[] => [
  {
    profilePath: 'education.university',
    labels: ['本科院校', '本科毕业院校', '本科毕业学校', '毕业院校', '毕业学校'],
    selectors: ['input[name*="bkbyxx" i]', 'input[name*="bkbydw" i]', 'select[name*="bkbyxx" i]', 'select[name*="school" i]'],
    driver: 'school-picker',
    componentDriver,
    codeNamespace: 'moe.school',
  },
  {
    profilePath: 'education.major',
    labels: ['本科专业', '本科所学专业', '所学专业'],
    selectors: ['input[name*="bkzy" i]', 'select[name*="bkzy" i]', 'input[name*="major" i]', 'select[name*="major" i]'],
    driver: 'major-picker',
    componentDriver,
    codeNamespace: 'moe.major',
  },
  { profilePath: 'basic.birthday', labels: ['出生日期', '出生年月'], selectors: ['input[name*="csrq" i]', 'input[name*="birth" i]'], driver: 'date', datePrecision: 'day' },
  { profilePath: 'education.startDate', labels: ['本科入学年月', '入学年月', '入学时间'], selectors: ['input[name*="rxny" i]', 'input[name*="rxsj" i]', 'input[name*="start" i]'], driver: 'month-picker', datePrecision: 'month' },
  { profilePath: 'education.endDate', labels: ['本科毕业年月', '预计毕业年月', '毕业时间'], selectors: ['input[name*="byny" i]', 'input[name*="bysj" i]', 'input[name*="end" i]'], driver: 'month-picker', datePrecision: 'month' },
];

const minimalSchoolMajorFields: AdapterFieldContract[] = [
  {
    profilePath: 'education.university',
    selectors: ['#txtBkbydwmc', '[name="txtBkbydwmc"]', '#ctl00_contentParent_txtBkbydwmc'],
    codeSelectors: ['#txtBkbydwm', '[name="txtBkbydwm"]', '#ctl00_contentParent_txtBkbydwm'],
    nameSelectors: ['#txtBkbydwmc', '[name="txtBkbydwmc"]', '#ctl00_contentParent_txtBkbydwmc'],
    driver: 'school-picker',
    codeNamespace: 'moe.school',
    picker: {
      triggerSelectors: ['#hykSelBkBydw', 'a[id*="SelBkBydw"]'],
      frameNames: ['SelUniversity'],
      frameSrcPatterns: ['*SelUniversity*'],
      searchInputSelectors: ['#txtWord', '[name="txtWord"]'],
      queryButtonSelectors: ['input[value="查询"]', 'a'],
      resultRowSelectors: ['table tr'],
      chooseSelectors: ['input[type="image"]', 'a', 'input[type="button"]'],
    },
  },
  {
    profilePath: 'education.major',
    selectors: ['#txtBkzymc', '[name="txtBkzymc"]', '#ctl00_contentParent_txtBkzymc'],
    codeSelectors: ['#txtBkzydm', '[name="txtBkzydm"]', '#ctl00_contentParent_txtBkzydm'],
    nameSelectors: ['#txtBkzymc', '[name="txtBkzymc"]', '#ctl00_contentParent_txtBkzymc'],
    driver: 'major-picker',
    codeNamespace: 'moe.major',
    picker: {
      triggerSelectors: ['#hykSelfszydm', 'a[id*="Selfszydm"]', '#hykSelBkzydm', 'a[id*="SelBkzydm"]'],
      frameNames: ['SelBkdzZydm', 'SelMajor', 'SelSubject', 'Selfszydm'],
      frameSrcPatterns: ['*SelBkdzZydm*', '*SelMajor*', '*SelSubject*', '*Selfszydm*'],
      searchInputSelectors: ['#txtWord', '[name="txtWord"]'],
      queryButtonSelectors: ['input[value="查询"]', 'a'],
      categorySelectSelectors: ['select'],
      resultRowSelectors: ['table tr'],
      chooseSelectors: ['input[type="image"]', 'a', 'input[type="button"]'],
    },
  },
  ...commonSchoolMajorDateFields().filter((field) => !['education.university', 'education.major'].includes(field.profilePath || '')),
];

/** 蓝色系统学校/专业三联字段：代码、名称和展示框必须由同一次弹窗选择共同回填。 */
const blueTripleSchoolMajorFields = (): AdapterFieldContract[] => [{
  nativeId: 'bkbydwShow', profilePath: 'education.university', driver: 'school-picker', codeNamespace: 'moe.school',
  codeSelectors: ['#bydwm', '[name="bydwm"]'],
  nameSelectors: ['#bydw', '[name="bydw"]'],
  displaySelectors: ['#bkbydwShow', '[name="bkbydwShow"]'],
  picker: {
    protocol: 'blue-flat',
    triggerSelectors: ['span.addon[onclick*="chooseSch"]', '#bkbydwShow + span.addon', '#bkbydwShow ~ span.addon'],
    frameNames: ['chooseSch', 'SelUniversity', 'universitySelectPage'],
    frameSrcPatterns: ['*chooseSch*', '*SelUniversity*', '*universitySelectPage*', '*school*', '*university*'],
    searchInputSelectors: ['input[type="text"]'], queryButtonSelectors: ['button', 'a', 'input[type="button"]'],
    resultRowSelectors: ['table tr'], chooseSelectors: ['[onclick]', 'span', 'td', 'tr'],
  },
}, {
  nativeId: 'bkbyzyShow', profilePath: 'education.major', driver: 'major-picker', codeNamespace: 'moe.major',
  codeSelectors: ['#byzydm', '[name="byzydm"]'],
  nameSelectors: ['#byzymc', '[name="byzymc"]'],
  displaySelectors: ['#bkbyzyShow', '[name="bkbyzyShow"]'],
  picker: {
    protocol: 'blue-flat',
    triggerSelectors: ['span.addon[onclick*="chooseZy"]', '#bkbyzyShow + span.addon', '#bkbyzyShow ~ span.addon'],
    frameNames: ['chooseZy', 'SelMajor', 'SelSubject', 'SelBkdzZydm', 'majorSelectPage'],
    frameSrcPatterns: ['*chooseZy*', '*SelMajor*', '*SelSubject*', '*SelBkdzZydm*', '*majorSelectPage*', '*major*', '*specialty*'],
    searchInputSelectors: ['input[type="text"]'], queryButtonSelectors: ['button', 'a', 'input[type="button"]'],
    resultRowSelectors: ['table tr'], chooseSelectors: ['[onclick]', 'span', 'td', 'tr'],
  },
},
{ nativeId: 'rxny', profilePath: 'education.startDate', driver: 'month-picker', datePrecision: 'month', dateFormat: 'yyyyMM' },
{ nativeId: 'byny', profilePath: 'education.endDate', driver: 'month-picker', datePrecision: 'month', dateFormat: 'yyyyMM' }];

export const SCHOOL_ADAPTER_PACKAGES: SchoolAdapterPackage[] = [
  pkg(
    'lzu-ytms', '兰州大学', '预推免', 'other', ['yjszs.lzu.edu.cn'], ['*/lzuyjsytms/*'],
    [
      page('workspace', '工作区', 'shell', ['*/wlogin.html', '*/main*']),
      { ...page('information', '信息填报', 'form', ['*/info*', '*/edit*', '*/main*'], ['#xm']), safeNavigationSelectors: ['a,button'], fields: [
        { nativeId: 'xm', profilePath: 'basic.name', driver: 'text' },
        { nativeId: 'zjlx', profilePath: 'basic.idType', driver: 'text' },
        { nativeId: 'zjhm', profilePath: 'basic.idCard', driver: 'text' },
        { nativeId: 'csrq', profilePath: 'basic.birthday', driver: 'date' },
        { nativeId: 'mz', profilePath: 'basic.nation', driver: 'text' },
        { nativeId: 'xb', profilePath: 'basic.gender', driver: 'radio' },
        { nativeId: 'zzmm', profilePath: 'basic.politicalStatus', driver: 'layui', codeNamespace: 'adapter:lzu-ytms' },
        { nativeId: 'xyjr', profilePath: 'basic.militaryStatus', driver: 'text' },
        { nativeId: 'rxnf', profilePath: 'education.startDate', driver: 'date' },
        { nativeId: 'bkbyny', profilePath: 'education.endDate', driver: 'date' },
        { nativeId: 'bkbysf', profilePath: 'education.province', driver: 'layui' },
        { nativeId: 'bkbyxx', profilePath: 'education.university', driver: 'school-picker', componentDriver: 'layui', codeNamespace: 'moe.school' },
        { nativeId: 'bkbyxy', profilePath: 'education.college', driver: 'layui' },
        { nativeId: 'bkbyzy3', profilePath: 'education.major', driver: 'major-picker', componentDriver: 'layui', codeNamespace: 'moe.major' },
        { nativeId: 'szzytnjzrs', profilePath: 'education.rankBase', driver: 'text' },
        { nativeId: 'zhcjpm', profilePath: 'education.comprehensiveRank', driver: 'text' },
        { nativeId: 'wgyspqt', profilePath: 'education.otherExams', driver: 'text' },
        { nativeId: 'dzyj', profilePath: 'basic.email', driver: 'text' },
        { nativeId: 'txdz', profilePath: 'basic.address', driver: 'text' },
        { nativeId: 'yzbm', profilePath: 'basic.postalCode', driver: 'text' },
        { nativeId: 'bkxy', profilePath: 'applications.0.college', driver: 'layui', codeNamespace: 'adapter:lzu-ytms' },
        { nativeId: 'bkzy', profilePath: 'applications.0.major', driver: 'layui', codeNamespace: 'adapter:lzu-ytms' },
        { nativeId: 'bkyjfx', profilePath: 'applications.0.direction', driver: 'layui', codeNamespace: 'adapter:lzu-ytms' },
        { nativeId: 'sftj', profilePath: 'education.obeyAdjust', driver: 'layui' },
        { nativeId: 'brcs', extensionKey: 'personalStatement', driver: 'textarea' },
        { nativeId: 'xxhgzjlTable', extensionKey: 'studyRows', driver: 'table' },
        { nativeId: 'kyqkTable', extensionKey: 'researchRows', driver: 'table' },
        { nativeId: 'jlhcfqkTable', extensionKey: 'awardRows', driver: 'table' },
      ] },
      page('upload', '材料上传', 'upload', ['*upload*', '*file*']),
    ],
    { mode: 'plugin', pageOrder: ['information'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'directory' }),
  ),
  pkg(
    'shmtu-sszs', '上海海事大学', '预推免', 'other', ['zhaosheng.eol.cn'], ['/10254/*'],
    [
      page('project', '选择招生项目', 'shell', ['/10254/*project*', '/10254/*program*']),
      { ...page('study', '学业信息', 'form', ['/10254/*'], ['select[name="edu_school_pro"],select[name="edu_school"]']), fields: [
        { nativeId: 'edu_school', profilePath: 'education.university', driver: 'school-picker', componentDriver: 'select2', codeNamespace: 'moe.school' },
        { nativeId: 'edu_major', profilePath: 'education.major', driver: 'major-picker', componentDriver: 'select2', codeNamespace: 'moe.major' },
        ...commonSchoolMajorDateFields('select2').filter((field) => !['education.university', 'education.major'].includes(field.profilePath || '')),
      ] },
      page('basic', '基本信息', 'form', ['/10254/*'], ['input,select,textarea']),
      page('application', '申请信息', 'form', ['/10254/*'], ['input,select,textarea']),
      page('honors', '荣誉与成果', 'form', ['/10254/*'], ['textarea,input']),
      page('upload', '上传材料', 'upload', ['/10254/*upload*', '/10254/*file*']),
    ],
    { mode: 'guided', pageOrder: ['basic', 'study', 'application', 'honors'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp(),
  ),
  pkg(
    'zuel-360eol-xly', '中南财经政法大学', '夏令营', 'other', ['zncjzf.form.360eol.com', 'yzb.zuel.edu.cn'], ['*'],
    [
      page('shell', '登录/汇总', 'shell', ['*/enroll/*', '*/registered*', '*/reset_password*', '*/c4644a434937*', '*/c4641a431789*', '*/c4639a434937*']),
      { ...page('personal', '个人信息', 'form', ['*/user/*', '*/student/*', '*/apply/*'], ['input,select,textarea']), fields: commonSchoolMajorDateFields() },
      { ...page('education', '教育信息', 'form', ['*/user/*', '*/student/*', '*/apply/*'], ['input,select,textarea']), fields: commonSchoolMajorDateFields() },
    ],
    { mode: 'guided', pageOrder: ['personal', 'education'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp(),
  ),
  pkg(
    'minimal-bupt-mastertm', '北京邮电大学', '预推免', 'minimal', ['yzfs.bupt.edu.cn'], ['/MasterTm/*'],
    [page('selection', '报名记录', 'crawl-only', ['/MasterTm/ExamineeViewSel.aspx']), { ...page('apply', '身份与学业信息', 'form', ['/MasterTm/Apply*.aspx']), fields: minimalSchoolMajorFields }],
    { mode: 'session', readOnlyPaths: ['/MasterTm/ExamineeViewSel.aspx', '/MasterTm/Apply.aspx', '/MasterTm/Apply1.aspx', '/MasterTm/Apply2.aspx', '/MasterTm/Apply3.aspx'], pageOrder: ['selection', 'apply'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' }),
  ),
  pkg(
    'minimal-njust-tm', '南京理工大学', '预推免', 'minimal', ['202.119.85.163'], ['/Open/RecruitTkssTmYbm/*'],
    [{ ...page('apply', '预推免报名信息', 'form', ['/Open/RecruitTkssTmYbm/ExamineeEditTmYbm*.aspx']), fields: minimalSchoolMajorFields }],
    { mode: 'session', readOnlyPaths: ['/Open/RecruitTkssTmYbm/ExamineeEditTmYbm.aspx', '/Open/RecruitTkssTmYbm/ExamineeEditTmYbm1.aspx', '/Open/RecruitTkssTmYbm/ExamineeEditTmYbm2.aspx', '/Open/RecruitTkssTmYbm/ExamineeEditTmYbm3.aspx', '/Open/RecruitTkssTmYbm/ExamineeEditTmYbm4.aspx', '/Open/RecruitTkssTmYbm/ExamineeEditTmYbm5.aspx'], pageOrder: ['apply'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' }),
  ),
  pkg('minimal-njust-xly', '南京理工大学', '夏令营', 'minimal', ['202.119.85.163'], ['/Open/ZsTkssXly/*'], [{ ...page('apply', '夏令营报名信息', 'form', ['/Open/ZsTkssXly/*']), fields: minimalSchoolMajorFields }], { mode: 'guided', pageOrder: ['apply'], blockPathPatterns: FORM_SHELL_BLOCKS }),
  pkg(
    'hfut-blue-tm', '合肥工业大学', '推免报名', 'blue', ['yzbm.hfut.edu.cn'], ['/sstm/*'],
    [{
      // 合工大 12 步向导共用 /sstm/ 加密路径，基本信息页通过稳定字段组合识别。
      ...page('basic', '基本信息', 'form', ['/sstm/*'], ['#xm', '#xmpy', '#mz', 'button.button.bg-sub']),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ['button.button.bg-sub', 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: ['.field-validation-error', '.validation-error', '.has-error', '.error', '.easyui-validatebox-invalid', '[aria-invalid="true"]'],
    }, {
      ...page('education', '学习信息', 'form', ['/sstm/*'], ['#bkbydwShow', '#bkbyzyShow', '#rxny', '#byny', 'button.button.bg-sub']),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ['button.button.bg-sub', 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: ['.field-validation-error', '.validation-error', '.has-error', '.error', '.easyui-validatebox-invalid', '[aria-invalid="true"]'],
      fields: blueTripleSchoolMajorFields(),
    }, {
      ...page('language', '外语水平', 'form', ['/sstm/*'], ['select[id^="lbmc"]', 'input[id^="cj"]', 'button.button.bg-sub']),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ['button.button.bg-sub', 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: ['.field-validation-error', '.validation-error', '.has-error', '.error', '.easyui-validatebox-invalid', '[aria-invalid="true"]'],
    }, {
      // 其余加密步骤只在出现真实 button 下一步且没有上传控件时开放；导航内核还会按按钮文字二次拦截提交。
      ...page('safe-form-step', '报名表单步骤', 'form', ['/sstm/*'], ['button.button.bg-sub']),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ['button.button.bg-sub', 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: ['.field-validation-error', '.validation-error', '.has-error', '.error', '.easyui-validatebox-invalid', '[aria-invalid="true"]'],
      fields: commonSchoolMajorDateFields(),
    }],
    { mode: 'guided', pageOrder: ['basic', 'education', 'language', 'safe-form-step'], blockPathPatterns: FORM_SHELL_BLOCKS },
    exp({ sessionCrawl: 'experimental' }),
    'blue',
    'validated-next-only',
  ),
  pkg(
    'ustb-blue-xly', '北京科技大学', '夏令营', 'blue', ['yjsy.ustb.edu.cn'], ['/ksxt/ssxly/*'],
    [{
      ...page('education', '教育信息', 'form', ['/ksxt/ssxly/*'], ['#bkbydwShow', '#bkbyzyShow', '#rxny', '#byny']),
      nextSelectors: ['button.button.bg-sub', 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: ['.field-validation-error', '.has-error', '.error', '.easyui-validatebox-invalid', '[aria-invalid="true"]'],
      fields: [
        {
          nativeId: 'bkbydwShow', profilePath: 'education.university', driver: 'school-picker', codeNamespace: 'moe.school',
          codeSelectors: ['#bydwm', '[name="bydwm"]'],
          nameSelectors: ['#bydw', '[name="bydw"]'],
          displaySelectors: ['#bkbydwShow', '[name="bkbydwShow"]'],
          picker: {
            protocol: 'blue-flat',
            triggerSelectors: ['span.addon[onclick*="chooseSch"]', '#bkbydwShow + span.addon', '#bkbydwShow ~ span.addon'],
            frameNames: ['chooseSch', 'SelUniversity'],
            frameSrcPatterns: ['*chooseSch*', '*school*', '*university*'],
            searchInputSelectors: ['input[type="text"]'], queryButtonSelectors: ['button', 'a', 'input[type="button"]'],
            resultRowSelectors: ['table tr'], chooseSelectors: ['[onclick]', 'span', 'td', 'tr'],
          },
        },
        {
          nativeId: 'bkbyzyShow', profilePath: 'education.major', driver: 'major-picker', codeNamespace: 'moe.major',
          codeSelectors: ['#byzydm', '[name="byzydm"]'],
          nameSelectors: ['#byzymc', '[name="byzymc"]'],
          displaySelectors: ['#bkbyzyShow', '[name="bkbyzyShow"]'],
          picker: {
            protocol: 'blue-flat',
            triggerSelectors: ['span.addon[onclick*="chooseZy"]', '#bkbyzyShow + span.addon', '#bkbyzyShow ~ span.addon'],
            frameNames: ['chooseZy', 'SelMajor', 'SelSubject', 'SelBkdzZydm'],
            frameSrcPatterns: ['*chooseZy*', '*SelMajor*', '*SelSubject*', '*SelBkdzZydm*', '*major*', '*specialty*'],
            searchInputSelectors: ['input[type="text"]'], queryButtonSelectors: ['button', 'a', 'input[type="button"]'],
            resultRowSelectors: ['table tr'], chooseSelectors: ['[onclick]', 'span', 'td', 'tr'],
          },
        },
        { nativeId: 'rxny', profilePath: 'education.startDate', driver: 'month-picker', datePrecision: 'month', dateFormat: 'yyyyMM' },
        { nativeId: 'byny', profilePath: 'education.endDate', driver: 'month-picker', datePrecision: 'month', dateFormat: 'yyyyMM' },
      ],
    }, {
      ...page('language', '外语水平', 'form', ['/ksxt/ssxly/*'], ['select[id^="lbmc"]', 'input[id^="cj"]', 'input[id^="sj"]']),
      nextSelectors: ['button.button.bg-sub', 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: ['.field-validation-error', '.has-error', '.error', '.easyui-validatebox-invalid', '[aria-invalid="true"]'],
    }, {
      // 北科大 13 步报名页使用同一条加密 URL，无法按 pathname 区分各步骤。
      // 只把存在蓝色“下一步”候选且不含上传控件的页面纳入连续填写；按钮文字仍由导航内核严格二次校验。
      ...page('safe-form-step', '报名表单步骤', 'form', ['/ksxt/ssxly/*'], ['button.button.bg-sub']),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ['button.button.bg-sub', 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: ['.field-validation-error', '.has-error', '.error', '.easyui-validatebox-invalid', '[aria-invalid="true"]'],
    }],
    { mode: 'guided', pageOrder: ['education', 'language', 'safe-form-step'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' }), 'blue', 'validated-next-only',
  ),
  pkg('platform-blue', '蓝色系统', '通用报名', 'blue', ['*'], ['*/logon*'], [{ ...page('form', '报名信息', 'form', ['*/apply*', '*/edit*', '*/info*']), fields: commonSchoolMajorDateFields('layui') }], { mode: 'guided', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' }), 'blue'),
  pkg('platform-jingzhi', '精致系统', '通用报名', 'jingzhi', ['*'], ['*/zsgl/*', '*/tmsgl/*', '*/xlygl/*'], [{ ...page('form', '报名信息填写', 'form', ['*edit*', '*apply*']), fields: commonSchoolMajorDateFields('element') }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }),
  pkg('platform-cover', '封面系统', '通用报名', 'cover', ['*'], ['*/gsapp/sys/*', '*/geapp/sys/*'], [{ ...page('form', '填报页面', 'form', ['*entrance*', '*apply*', '*info*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }),
  pkg('muc-tm', '中央民族大学', '预推免', 'other', ['yjszs.muc.edu.cn'], ['*'], [{ ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('xmu-pre', '厦门大学', '预推免', 'other', ['ssyjsbm.xmu.edu.cn'], ['*'], [{ ...page('form', '报名工作区', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('njnu-pre', '南京师范大学', '预推免', 'other', ['yz.njnu.edu.cn'], ['*'], [{ ...page('form', '报名向导', 'form', ['*']), fields: commonSchoolMajorDateFields('element') }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('swufe-pre', '西南财经大学', '预推免', 'other', ['yjsbm.swufe.edu.cn'], ['*'], [{ ...page('form', '报名向导', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('nankai-pre', '南开大学', '预推免', 'other', ['yzxt.nankai.edu.cn'], ['*'], [page('register', '注册', 'shell', ['*register*']), { ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ registerFill: 'experimental', sessionCrawl: 'experimental' })),
  pkg('ruc-pre', '中国人民大学', '预推免', 'other', ['yjsfs.ruc.edu.cn'], ['*'], [page('register', '注册', 'shell', ['*register*']), { ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ registerFill: 'experimental', sessionCrawl: 'experimental' })),
  ...[
    ['tju-pre', '天津大学', '预推免', 'sszs.tju.edu.cn', 'default'],
    ['zju-xly-pre', '浙江大学', '夏令营/预推免', 'yjsy.zju.edu.cn', 'zju'],
    ['jlu-xly', '吉林大学', '夏令营', 'yzbbm.jlu.edu.cn', 'default'],
    ['kmmu-xly', '昆明医科大学', '夏令营', 'yjsgl.kmmu.edu.cn', 'default'],
    ['gxu-xly', '广西大学', '夏令营', 'yjsglxt.gxu.edu.cn', 'default'],
    ['blcu-pre', '北京语言大学', '预推免', 'yanzhao.blcu.edu.cn', 'default'],
    ['ouc-pre', '中国海洋大学', '预推免', 'stuouc.molstone.cn', 'default'],
    ['chd-xly', '长安大学', '夏令营', 'yzfw.chd.edu.cn', 'default'],
    ['ecust-pre', '华东理工大学', '预推免', 'yz.ecust.edu.cn', 'default'],
    ['hit-pre', '哈尔滨工业大学', '预推免', 'hityzb.hit.edu.cn', 'hit'],
  ].map(([id, school, program, host, projection]) => {
    const component = id === 'zju-xly-pre' ? 'ant' : ['jlu-xly', 'kmmu-xly', 'gxu-xly', 'blcu-pre', 'ouc-pre', 'chd-xly'].includes(id) ? 'element' : undefined;
    return pkg(id, school, program, 'other', [host], ['*'], [{ ...page('form', '报名信息', 'form', ['*'], ['input,select,textarea']), fields: commonSchoolMajorDateFields(component as AdapterFieldContract['componentDriver']) }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ registerFill: id === 'chd-xly' ? 'experimental' : 'directory' }), projection);
  }),
  pkg('ucas-pre', '中国科学院大学', '预推免', 'other', ['zxsq.ucas.ac.cn'], ['*'], [{ ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'guided', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ pluginExtract: 'directory', sessionCrawl: 'directory' })),
];

export function validateAdapterPackage(raw: unknown): SchoolAdapterPackage {
  if (!raw || typeof raw !== 'object') throw new Error('适配包不是对象');
  const p = raw as SchoolAdapterPackage;
  if (p.schemaVersion !== 1 || !p.id || !p.version || !p.schoolName || !p.match?.hosts?.length) throw new Error('适配包缺少必需字段');
  if (!Array.isArray(p.pages) || !p.pages.every((x) => x.id && x.name && Array.isArray(x.pathPatterns) && ['form', 'crawl-only', 'shell', 'upload', 'print', 'result'].includes(x.role))) throw new Error('页面契约格式错误');
  if (new Set(p.pages.map((x) => x.id)).size !== p.pages.length) throw new Error('页面契约 ID 重复');
  const driverIds = new Set(['text', 'radio', 'native-select', 'date', 'month-picker', 'date-range', 'textarea', 'table', 'layui', 'ant', 'select2', 'element', 'kendo', 'aspnet', 'school-picker', 'major-picker']);
  const stringList = (value: unknown): boolean => value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
  if (p.pages.some((x) => x.fields?.some((field) => !driverIds.has(field.driver) || (!field.profilePath && !field.extensionKey)))) throw new Error('字段契约格式错误');
  if (p.pages.some((x) => x.fields?.some((field) =>
    !stringList(field.labels) || !stringList(field.selectors) || !stringList(field.codeSelectors) || !stringList(field.nameSelectors) || !stringList(field.displaySelectors) ||
    !stringList(field.dateModelSelectors) || !stringList(field.datePanelSelectors) ||
    !stringList(field.picker?.triggerSelectors) || !stringList(field.picker?.frameNames) || !stringList(field.picker?.frameSrcPatterns) ||
    !stringList(field.picker?.searchInputSelectors) || !stringList(field.picker?.queryButtonSelectors) || !stringList(field.picker?.resultRowSelectors) ||
    !stringList(field.picker?.chooseSelectors) || !stringList(field.picker?.categorySelectSelectors),
  ))) throw new Error('字段契约选择器必须是字符串数组');
  if (p.pages.some((x) => !stringList(x.nextSelectors) || !stringList(x.validationErrorSelectors))) throw new Error('页面导航契约选择器必须是字符串数组');
  if (p.pages.some((x) => x.fields?.some((field) => field.picker?.protocol && !['minimal', 'blue-flat'].includes(field.picker.protocol)))) throw new Error('字段契约弹窗协议无效');
  const dateFormats = new Set(['yyyy', 'yyyyMM', 'yyyy-MM', 'yyyy/MM', 'yyyy年MM月', 'yyyyMMdd', 'yyyy-MM-dd', 'yyyy/MM/dd', 'yyyy年MM月dd日']);
  if (p.pages.some((x) => x.fields?.some((field) => field.dateFormat && !dateFormats.has(field.dateFormat)))) throw new Error('字段契约日期格式无效');
  if (!p.crawl || !Array.isArray(p.crawl.pageOrder)) throw new Error('爬取契约格式错误');
  if (p.crawl.pageOrder.some((id) => !p.pages.some((pageItem) => pageItem.id === id))) throw new Error('爬取步骤引用了不存在的页面契约');
  if (p.crawl.readOnlyPaths?.some((path) => typeof path !== 'string' || !path.startsWith('/') || /:\/\/|\.\./.test(path))) throw new Error('会话爬取白名单必须是同源绝对路径');
  if (!['never', 'manual-save-only', 'validated-next-only'].includes(p.commitPolicy)) throw new Error('提交策略格式错误');
  if (!p.capabilities || Object.values(p.capabilities).some((status) => !['directory', 'experimental', 'verified', 'drifted'].includes(status))) throw new Error('能力状态格式错误');
  const rejectExecutable = (value: unknown, seen = new Set<unknown>()): void => {
    if (typeof value === 'function') throw new Error('远程适配包不得包含可执行函数');
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value as Record<string, unknown>)) rejectExecutable(child, seen);
  };
  rejectExecutable(p);
  return p;
}

export function matchAdapterPackage(url: string, packages: SchoolAdapterPackage[] = SCHOOL_ADAPTER_PACKAGES): SchoolAdapterPackage | undefined {
  return packages.find((p) => declarativeMatchUrl(p.match, url));
}

function glob(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

export function isCrawlPathBlocked(adapter: SchoolAdapterPackage, rawUrl: string): boolean {
  let path = rawUrl;
  try { const url = new URL(rawUrl); path = `${url.pathname}${url.search}${url.hash}`; } catch { /* 保留原串 */ }
  return !!adapter.crawl.blockPathPatterns?.some((pattern) => glob(pattern, path));
}

export interface PageMatchResult {
  page?: AdapterPageContract;
  allowed: boolean;
  reason: string;
  fingerprint: string;
}

export function fingerprintDocument(doc: Document): string {
  const controls = Array.from(doc.querySelectorAll('input,select,textarea,table')).slice(0, 300).map((el) => `${el.tagName.toLowerCase()}:${el.getAttribute('id') || ''}:${el.getAttribute('name') || ''}:${el.getAttribute('type') || ''}`).join('|');
  let h = 2166136261;
  for (let i = 0; i < controls.length; i++) { h ^= controls.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function matchAdapterPage(adapter: SchoolAdapterPackage, doc: Document, rawUrl: string): PageMatchResult {
  let path = rawUrl;
  try { const u = new URL(rawUrl); path = `${u.pathname}${u.search}${u.hash}`; } catch { /* 保留原串 */ }
  const fp = fingerprintDocument(doc);
  for (const p of adapter.pages) {
    if (!p.pathPatterns.some((x) => glob(x, path))) continue;
    if (p.titlePatterns?.length && !p.titlePatterns.some((x) => glob(x, doc.title))) continue;
    if (p.requiredSelectors?.length && !p.requiredSelectors.every((x) => !!doc.querySelector(x))) continue;
    if (p.forbiddenSelectors?.some((x) => !!doc.querySelector(x))) continue;
    if (p.expectedFingerprints?.length && !p.expectedFingerprints.includes(fp)) return { page: p, allowed: false, reason: '页面结构指纹发生变化，专项能力已降级并停止', fingerprint: fp };
    const allowed = p.role === 'form' || p.role === 'crawl-only';
    return { page: p, allowed, reason: allowed ? `已识别：${adapter.schoolName}·${p.name}` : `${p.name}不是可采集填报页`, fingerprint: fp };
  }
  return { allowed: false, reason: '页面结构未命中适配包契约', fingerprint: fp };
}

export function capabilityStatus(adapter: SchoolAdapterPackage, capability: keyof AdapterCapabilities): SupportStatus {
  return adapter.capabilities[capability];
}

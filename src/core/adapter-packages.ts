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
  // 北京师范大学推免（xly.bnu.edu.cn/tm）：miniui 框架 + buttonedit picker，登录后 iframe 弹窗
  pkg(
    'minimal-bnu-tm', '北京师范大学', '预推免', 'minimal', ['xly.bnu.edu.cn'], ['/tm/*'],
    [
      page('login', '登录页', 'shell', ['/tm', '/tm/', '/tm/index']),
      { ...page('register', '注册', 'shell', ['/tm/account/register', '/tm#join']),
        forbiddenSelectors: ['input[type="file"]'],
        validationErrorSelectors: ['label.error', 'span.error'] },
      { ...page('apply', '预推免报名', 'form', ['/tm/www/tm/*/Examinee*', '/tm/www/tm/*/uform*', '/tm/uform*']),
        // miniui 框架：buttonedit 弹窗 + select-text 输入框（display=in-block）
        fields: [
          { profilePath: 'education.university', labels: ['毕业院校', '本科毕业院校', '毕业学校'], selectors: ['input.mini-buttonedit-input[name*="school" i]', 'input.mini-buttonedit-input[name*="byxx" i]', 'input.mini-buttonedit-input[name*="bydw" i]'], driver: 'school-picker', codeSelectors: ['input.mini-buttonedit-input[name*="schoolcode" i]', 'input.mini-buttonedit-input[name*="dwm" i]'], nameSelectors: ['input.mini-buttonedit-input[name*="school" i]', 'input.mini-buttonedit-input[name*="byxx" i]'], codeNamespace: 'moe.school', picker: { protocol: 'minimal', triggerSelectors: ['.mini-buttonedit-button', 'span.mini-buttonedit-button', 'span.mini-buttonedit-trigger'], frameNames: ['miniui', 'lookup', 'lookupWin'], frameSrcPatterns: ['*lookup*', '*select*', '*school*'], searchInputSelectors: ['input[type="text"]', 'input.mini-buttonedit-input'], queryButtonSelectors: ['a.mini-button', 'input[type="button"]', 'a[onclick*="search" i]'], resultRowSelectors: ['table tr', '.mini-grid-row'], chooseSelectors: ['a.mini-button', 'input[type="button"]', 'a[onclick*="select" i]'] } },
          { profilePath: 'education.major', labels: ['本科专业', '毕业专业', '所学专业'], selectors: ['input.mini-buttonedit-input[name*="major" i]', 'input.mini-buttonedit-input[name*="zy" i]'], driver: 'major-picker', codeSelectors: ['input.mini-buttonedit-input[name*="majorcode" i]', 'input.mini-buttonedit-input[name*="zydm" i]'], nameSelectors: ['input.mini-buttonedit-input[name*="major" i]', 'input.mini-buttonedit-input[name*="zy" i]'], codeNamespace: 'moe.major', picker: { protocol: 'minimal', triggerSelectors: ['.mini-buttonedit-button', 'span.mini-buttonedit-button'], frameNames: ['miniui', 'lookup'], frameSrcPatterns: ['*lookup*', '*select*', '*major*'], searchInputSelectors: ['input[type="text"]', 'input.mini-buttonedit-input'], queryButtonSelectors: ['a.mini-button', 'input[type="button"]', 'a[onclick*="search" i]'], resultRowSelectors: ['table tr', '.mini-grid-row'], chooseSelectors: ['a.mini-button', 'input[type="button"]', 'a[onclick*="select" i]'] } },
          ...commonSchoolMajorDateFields().filter((field) => !['education.university', 'education.major'].includes(field.profilePath || '')),
        ] },
    ],
    { mode: 'session', blockPathPatterns: ['/tm/account/register', '/tm/core/login/*', '/tm/core/api/authcode*', ...FORM_SHELL_BLOCKS], pageOrder: ['apply'], readOnlyPaths: ['/tm/core/login/DoLogin/tm_user', '/tm/www/tm/xs/dosignup', '/tm/www/tm/xs/dofindpwd'] }, exp({ sessionCrawl: 'experimental' }),
  ),
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

  // 蓝色系统专属适配包：schools.ts 中已标记 adapter:"blue-xxx" 的学校。
  // 这些学校使用 Layui 弹窗 chooseSch/chooseZy，通过 blue-flat 协议完成院校/专业三联回填。
  // 优先级高于 platform-blue（通配），因为更具体的 host 匹配会先被 resolveAdapters 命中。
  ...buildBlueSchoolAdapterPackages(),

  pkg('platform-jingzhi', '精致系统', '通用报名', 'jingzhi', ['*'], ['*/zsgl/*', '*/tmsgl/*', '*/xlygl/*'], [{ ...page('form', '报名信息填写', 'form', ['*edit*', '*apply*']), fields: commonSchoolMajorDateFields('element') }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }),

  // 复古 ASP 系统预推免（统一契约）：蓝三联 + drpbyyx 复用
  // 蓝三联：bydwm/bydw/bkbydwShow 弹出 chooseSch 选院校；byzydm/byzymc/bkbyzyShow 弹出 chooseZy 选专业
  // drpbyyx 下拉：中南/南农/华电等常用，无弹窗即可选院校
  // 奖励项：txthjmc/txthjsj/txtpm 静态槽（retro-honor-fill.ts 接管）
  ...(() => {
    const RETRO_SCHOOL_MAJOR_FIELDS: AdapterFieldContract[] = [
      {
        profilePath: 'education.university',
        labels: ['毕业院校', '本科毕业院校', '毕业学校', '本科学校', '所在学校', '学生来源学校'],
        selectors: ['input[id*="drpbyyx" i]', 'select[id*="drpbyyx" i]', 'input[id*="bydwm" i]', 'input[id*="bydw" i]', 'input[id*="bkbydwShow" i]', 'input[id*="txtszyxmc" i]'],
        driver: 'school-picker',
        codeSelectors: ['input[id*="bydwm" i]', 'input[name*="bydwm" i]'],
        nameSelectors: ['input[id*="bydw" i]', 'input[name*="bydw" i]', 'input[id*="bkbydwShow" i]', 'input[id*="txtszyxmc" i]'],
        displaySelectors: ['input[id*="bkbydwShow" i]', 'input[name*="bkbydwShow" i]'],
        codeNamespace: 'moe.school',
        picker: {
          protocol: 'blue-flat',
          triggerSelectors: ['span.addon[onclick*="chooseSch"]', 'span.addon[onclick*="chooseYx"]', 'a[onclick*="chooseSch"]', 'a[onclick*="chooseYx"]'],
          frameNames: ['chooseSch', 'chooseYx', 'SelUniversity', 'universitySelectPage', 'SchoolPage'],
          frameSrcPatterns: ['*chooseSch*', '*chooseYx*', '*SelUniversity*', '*universitySelectPage*', '*school*', '*university*'],
          searchInputSelectors: ['input[type="text"]', 'input.search', 'input[name="key"]', '#key'],
          queryButtonSelectors: ['button', 'a', 'input[type="button"]', 'input[value="查询"]', 'input[value="搜索"]'],
          resultRowSelectors: ['table tr', 'li.result', 'tr.trbg'],
          chooseSelectors: ['input[type="image"]', 'a', 'input[type="button"]', 'span[onclick]', 'td[onclick]', 'tr[onclick]'],
        },
      },
      {
        profilePath: 'education.major',
        labels: ['毕业专业', '本科专业', '所学专业', '专业名称'],
        selectors: ['input[id*="byzymc" i]', 'input[id*="byzy" i]', 'input[id*="txtbyzy" i]', 'input[id*="bkbyzyShow" i]'],
        driver: 'major-picker',
        codeSelectors: ['input[id*="byzydm" i]', 'input[name*="byzydm" i]'],
        nameSelectors: ['input[id*="byzymc" i]', 'input[id*="byzy" i]', 'input[id*="txtbyzy" i]', 'input[id*="bkbyzyShow" i]'],
        displaySelectors: ['input[id*="bkbyzyShow" i]', 'input[name*="bkbyzyShow" i]'],
        codeNamespace: 'moe.major',
        picker: {
          protocol: 'blue-flat',
          triggerSelectors: ['span.addon[onclick*="chooseZy"]', 'span.addon[onclick*="chooseZydm"]', 'a[onclick*="chooseZy"]'],
          frameNames: ['chooseZy', 'chooseZydm', 'SelMajor', 'SelSubject', 'SelBkdzZydm', 'majorSelectPage', 'MajorPage'],
          frameSrcPatterns: ['*chooseZy*', '*chooseZydm*', '*SelMajor*', '*SelSubject*', '*SelBkdzZydm*', '*majorSelectPage*', '*major*', '*specialty*'],
          searchInputSelectors: ['input[type="text"]', 'input.search', 'input[name="key"]', '#key'],
          queryButtonSelectors: ['button', 'a', 'input[type="button"]', 'input[value="查询"]', 'input[value="搜索"]'],
          resultRowSelectors: ['table tr', 'li.result', 'tr.trbg'],
          chooseSelectors: ['input[type="image"]', 'a', 'input[type="button"]', 'span[onclick]', 'td[onclick]', 'tr[onclick]'],
        },
      },
      { profilePath: 'education.college', labels: ['所在院系', '院系', '学院', '所属学院'], selectors: ['input[id*="szxy" i]', 'input[id*="yxmc" i]', 'input[id*="txtszxy" i]'], driver: 'text' },
      { profilePath: 'basic.birthday', labels: ['出生日期', '出生年月'], selectors: ['input[id*="csrq" i]', 'input[id*="txtcsrq" i]'], driver: 'date', datePrecision: 'day' },
      { profilePath: 'education.startDate', labels: ['入学年月', '本科入学年月', '入学时间'], selectors: ['input[id*="rxny" i]', 'input[id*="txtrxny" i]'], driver: 'month-picker', datePrecision: 'month' },
      { profilePath: 'education.endDate', labels: ['毕业年月', '预计毕业年月', '毕业时间'], selectors: ['input[id*="byny" i]', 'input[id*="bkbyny" i]', 'input[id*="txtbkbyny" i]'], driver: 'month-picker', datePrecision: 'month' },
    ];
    // 批量声明：竞品 host_school_seed.js 中已显式覆盖的复古系统预推免学校。
    // 任何字段映射差异只在 spec 内调整，适配包结构保持一致。
    return ([
      // [id, 学校名, 域名, pathPatterns]
      ['retro-tmsgl-csu', '中南大学', 'yjszsgl.csu.edu.cn', ['*/zsgl2026/*', '*/zsgl/*', '*/tmsgl/*']],
      ['retro-tmsgl-hnu', '湖南大学', 'yjszsxt.hnu.edu.cn', ['*/zsxt2026/*', '*/zsxt/*', '*/tmsgl/*']],
      ['retro-tmsgl-jiangnan', '江南大学', 'yzgmis.jiangnan.edu.cn', ['*/zsgl/*', '*/tmsgl/*', '*/register*']],
      ['retro-tmsgl-njau', '南京农业大学', 'yzglxt.njau.edu.cn', ['*/gts/*', '*/tmsgl/*']],
      ['retro-tmsgl-ncepu', '华北电力大学', 'yjszs.ncepu.edu.cn', ['*/zsgl/*', '*/tmsgl/*']],
      ['retro-tmsgl-ujs', '江苏大学', 'yjszsgl.ujs.edu.cn', ['*/zsgl/*', '*/tmsgl/*']],
      ['retro-tmsgl-hnucm', '湖南中医药大学', 'yjsxt.hnucm.edu.cn', ['*/zsgl/*', '*/tmsgl/*']],
      ['retro-tmsgl-sjtu', '上海交通大学', 'ga.sjtu.edu.cn', ['*/zsgl/*', '*/ytmgl/*', '*/xlygl/*']],
      ['retro-tmsgl-bjut', '北京工业大学', 'webrecdoc.bjut.edu.cn', ['*/zsgl/*', '*/tmsgl/*', '*/xlygl/*']],
    ] as [string, string, string, string[]][]).map(([id, schoolName, host, pathPatterns]) =>
      pkg(
        id, schoolName, '预推免', 'jingzhi', [host], pathPatterns,
        [
          page('shell', '登录/项目选择', 'shell', ['*login*', '*tmsgl*', '*register*']),
          { ...page('form', '报名信息', 'form', ['*'], ['input,select,textarea']), fields: RETRO_SCHOOL_MAJOR_FIELDS },
        ],
        { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS },
        exp({ sessionCrawl: 'experimental' }),
      ),
    );
  })(),
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

  // P3：对照竞品补齐的 cover_system / jingzhi_system / retro_system 学校（与 platform-* 不冲突时优先）
  pkg('gdut-gsapp', '广东工业大学', '预推免', 'cover', ['yjsxt.gdut.edu.cn'], ['*/gsapp/*'], [{ ...page('form', '填报页面', 'form', ['*entrance*', '*apply*', '*info*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('hainanu-gsapp', '海南大学', '预推免', 'cover', ['ehall.hainanu.edu.cn'], ['*/gsapp/*'], [{ ...page('form', '填报页面', 'form', ['*entrance*', '*apply*', '*info*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('jnu-gsapp', '暨南大学', '预推免', 'cover', ['yjsxt.jnu.edu.cn'], ['*/gsapp/*'], [{ ...page('form', '填报页面', 'form', ['*entrance*', '*apply*', '*info*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('gzhu-gsapp', '广州大学', '预推免', 'cover', ['yjsyxt.gzhu.edu.cn'], ['*/gsapp/*'], [{ ...page('form', '填报页面', 'form', ['*entrance*', '*apply*', '*info*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('whu-gsapp', '武汉大学', '预推免', 'cover', ['yz.whu.edu.cn', 'ehall.whu.edu.cn'], ['*'], [{ ...page('form', '填报页面', 'form', ['*entrance*', '*apply*', '*info*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  // 东北大学预推免：tpass 登录 + gsapp 推免服务（独立自建，参考真实抓取 yjs.neu.edu.cn）
  pkg(
    'gsapp-neu', '东北大学', '预推免', 'cover', ['yjs.neu.edu.cn'], ['*/gsapp/*', '*/yjsemaphome/*'],
    [
      page('login', '统一身份认证', 'shell', ['/tpass/*'], ['input[name="un"]', 'input[name="pd"]', 'img[src*="/tpass/code"]']),
      { ...page('form', '推免报名信息', 'form', ['*entrance*', '*apply*', '*info*']), fields: commonSchoolMajorDateFields() },
    ],
    { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: [...FORM_SHELL_BLOCKS, '/tpass/login', '/tpass/code'] }, exp({ sessionCrawl: 'experimental' }),
  ),
  // 北京师范大学推免（独立适配 bnu-tm 入口已存在，这里加 NEU-style gsapp 通用兜底）
  pkg('ucas-tms', '中国科学院大学', '推免', 'other', ['zhaosheng.ucas.ac.cn'], ['*/sign_up/*', '*/TMS/*'], [{ ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('sysu-enroll', '中山大学', '预推免', 'jingzhi', ['enroll.sysu.edu.cn'], ['*/yjszs/plugins/*'], [{ ...page('form', '报名信息', 'form', ['*entrance*']), fields: commonSchoolMajorDateFields('element') }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('nwafu-yjszs', '西北农林科技大学', '预推免', 'jingzhi', ['yjszs.nwafu.edu.cn', 'yjszs.nwsuaf.edu.cn'], ['*/yjszs/plugins/*'], [{ ...page('form', '报名信息', 'form', ['*entrance*']), fields: commonSchoolMajorDateFields('element') }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('hunnu-tmsgl', '湖南师范大学', '预推免', 'jingzhi', ['yjsyzsxt.hunnu.edu.cn'], ['*/zsxt2025/*', '*/zsxt/*', '*/tmsgl/*'], [
    page('shell', '登录/项目选择', 'shell', ['*login*', '*tmsgl*']),
    { ...page('form', '报名信息', 'form', ['*'], ['input,select,textarea']), fields: [
      { profilePath: 'education.university', labels: ['毕业院校', '本科毕业院校', '毕业学校', '本科学校'], selectors: ['input[id*="drpbyyx" i]', 'select[id*="drpbyyx" i]', 'input[id*="bydwm" i]', 'input[id*="bydw" i]', 'input[id*="bkbydwShow" i]'], driver: 'school-picker', codeSelectors: ['input[id*="bydwm" i]'], nameSelectors: ['input[id*="bydw" i]', 'input[id*="bkbydwShow" i]'], displaySelectors: ['input[id*="bkbydwShow" i]'], codeNamespace: 'moe.school', picker: { protocol: 'blue-flat', triggerSelectors: ['span.addon[onclick*="chooseSch"]', 'a[onclick*="chooseSch"]'], frameNames: ['chooseSch', 'SelUniversity'], frameSrcPatterns: ['*chooseSch*', '*school*'], searchInputSelectors: ['input[type="text"]'], queryButtonSelectors: ['button', 'a', 'input[type="button"]'], resultRowSelectors: ['table tr'], chooseSelectors: ['input[type="image"]', 'a', 'span[onclick]'] } },
      { profilePath: 'education.major', labels: ['毕业专业', '本科专业', '所学专业'], selectors: ['input[id*="byzymc" i]', 'input[id*="byzy" i]', 'input[id*="bkbyzyShow" i]'], driver: 'major-picker', codeSelectors: ['input[id*="byzydm" i]'], nameSelectors: ['input[id*="byzymc" i]', 'input[id*="bkbyzyShow" i]'], displaySelectors: ['input[id*="bkbyzyShow" i]'], codeNamespace: 'moe.major', picker: { protocol: 'blue-flat', triggerSelectors: ['span.addon[onclick*="chooseZy"]'], frameNames: ['chooseZy', 'SelMajor'], frameSrcPatterns: ['*chooseZy*', '*major*'], searchInputSelectors: ['input[type="text"]'], queryButtonSelectors: ['button', 'a', 'input[type="button"]'], resultRowSelectors: ['table tr'], chooseSelectors: ['input[type="image"]', 'a', 'span[onclick]'] } },
      { profilePath: 'basic.birthday', labels: ['出生日期', '出生年月'], selectors: ['input[id*="csrq" i]'], driver: 'date', datePrecision: 'day' },
      { profilePath: 'education.startDate', labels: ['入学年月'], selectors: ['input[id*="rxny" i]'], driver: 'month-picker', datePrecision: 'month' },
      { profilePath: 'education.endDate', labels: ['毕业年月'], selectors: ['input[id*="byny" i]'], driver: 'month-picker', datePrecision: 'month' },
    ] },
  ], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  // 中国矿业大学（蓝色系统，已有 platform-blue 通配；这里只补 host 限定，避免路径冲突）
  pkg('blue-cumt', '中国矿业大学', '预推免', 'blue', ['yzs.cumt.edu.cn'], ['*/yzbm/logon*', '*/apply*'], [{ ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields('layui') }], { mode: 'guided', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' }), 'blue'),
  // 中国地质大学（简约系统，竞品 cug_tms / cug_xly 分支）
  pkg('cug-tms', '中国地质大学', '预推免', 'jingzhi', ['epo.cug.edu.cn'], ['*/Open/ZsTkssTms/*'], [{ ...page('form', '报名信息', 'form', ['*Signin*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  pkg('cug-xly', '中国地质大学', '夏令营', 'jingzhi', ['epo.cug.edu.cn'], ['*/Open/ZsTkssXly/*'], [{ ...page('form', '报名信息', 'form', ['*Signin*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  // 北京林业大学（other，其他系统）
  pkg('bjfu-tm', '北京林业大学', '推免', 'other', ['yzbm.bjfu.edu.cn'], ['*'], [{ ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  // 沈阳药科大学（other）
  pkg('syphu-ybm', '沈阳药科大学', '推免', 'other', ['yjs.syphu.edu.cn'], ['*'], [{ ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  // 北京协和医学院（other）
  pkg('pumc-tm', '北京协和医学院', '推免', 'other', ['yzbtm.pumc.edu.cn'], ['*'], [{ ...page('form', '报名信息', 'form', ['*login*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  // 中央财经大学（other）
  pkg('cufe-yzgl', '中央财经大学', '推免', 'other', ['yzgl.cufe.edu.cn'], ['*'], [{ ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  // 东北师范大学（other）
  pkg('nenu-ybm', '东北师范大学', '推免', 'other', ['yz.nenu.edu.cn'], ['*'], [{ ...page('form', '报名信息', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'plugin', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
  // 厦门大学夏令营分支
  pkg('xmu-dxsxly', '厦门大学', '夏令营', 'other', ['dxsxly.xmu.edu.cn'], ['*'], [{ ...page('form', '报名工作区', 'form', ['*']), fields: commonSchoolMajorDateFields() }], { mode: 'session', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: 'experimental' })),
];

/**
 * 功能：批量生成蓝色系统专属适配包。
 * 适配包使用 blue-flat 协议声明院校/专业三联字段；与通用 platform-blue 共存，resolveAdapters 会按 host 精确匹配优先命中。
 * 新增学校时只追加 [id, 学校名, 域名] 即可。
 */
export function buildBlueSchoolAdapterPackages(): SchoolAdapterPackage[] {
  const BLUE_SCHOOL_MAJOR_FIELDS: AdapterFieldContract[] = [
    {
      profilePath: 'education.university',
      labels: ['毕业院校', '本科毕业院校', '毕业学校', '本科学校'],
      selectors: ['input[id*="bydwm" i]', 'input[id*="bkbydwShow" i]', 'input[name*="bydwm" i]'],
      driver: 'school-picker',
      codeSelectors: ['input[id*="bydwm" i]', 'input[name*="bydwm" i]'],
      nameSelectors: ['input[id*="bydw" i]', 'input[id*="bkbydwShow" i]', 'input[name*="bydw" i]'],
      displaySelectors: ['input[id*="bkbydwShow" i]', 'input[name*="bkbydwShow" i]'],
      codeNamespace: 'moe.school',
      picker: {
        protocol: 'blue-flat',
        triggerSelectors: ['span.addon[onclick*="chooseSch"]', 'span.addon[onclick*="chooseYx"]', 'a[onclick*="chooseSch"]', 'a[onclick*="chooseYx"]'],
        frameNames: ['chooseSch', 'chooseYx', 'SelUniversity', 'universitySelectPage', 'SchoolPage'],
        frameSrcPatterns: ['*chooseSch*', '*chooseYx*', '*SelUniversity*', '*universitySelectPage*', '*school*', '*university*'],
        searchInputSelectors: ['input[type="text"]', 'input.search', 'input[name="key"]', '#key'],
        queryButtonSelectors: ['button', 'a', 'input[type="button"]', 'input[value="查询"]', 'input[value="搜索"]'],
        resultRowSelectors: ['table tr', 'li.result', 'tr.trbg'],
        chooseSelectors: ['input[type="image"]', 'a', 'input[type="button"]', 'span[onclick]', 'td[onclick]', 'tr[onclick]'],
      },
    },
    {
      profilePath: 'education.major',
      labels: ['毕业专业', '本科专业', '所学专业', '专业名称'],
      selectors: ['input[id*="byzydm" i]', 'input[id*="byzymc" i]', 'input[name*="byzydm" i]', 'input[name*="byzymc" i]'],
      driver: 'major-picker',
      codeSelectors: ['input[id*="byzydm" i]', 'input[name*="byzydm" i]'],
      nameSelectors: ['input[id*="byzymc" i]', 'input[id*="byzy" i]', 'input[name*="byzymc" i]'],
      displaySelectors: ['input[id*="bkbyzyShow" i]', 'input[name*="bkbyzyShow" i]'],
      codeNamespace: 'moe.major',
      picker: {
        protocol: 'blue-flat',
        triggerSelectors: ['span.addon[onclick*="chooseZy"]', 'span.addon[onclick*="chooseZydm"]', 'a[onclick*="chooseZy"]'],
        frameNames: ['chooseZy', 'chooseZydm', 'SelMajor', 'SelSubject', 'SelBkdzZydm', 'majorSelectPage', 'MajorPage'],
        frameSrcPatterns: ['*chooseZy*', '*chooseZydm*', '*SelMajor*', '*SelSubject*', '*SelBkdzZydm*', '*majorSelectPage*', '*major*', '*specialty*'],
        searchInputSelectors: ['input[type="text"]', 'input.search', 'input[name="key"]', '#key'],
        queryButtonSelectors: ['button', 'a', 'input[type="button"]', 'input[value="查询"]', 'input[value="搜索"]'],
        resultRowSelectors: ['table tr', 'li.result', 'tr.trbg'],
        chooseSelectors: ['input[type="image"]', 'a', 'input[type="button"]', 'span[onclick]', 'td[onclick]', 'tr[onclick]'],
      },
    },
    { profilePath: 'basic.birthday', labels: ['出生日期', '出生年月'], selectors: ['input[id*="csrq" i]', 'input[id*="txtcsrq" i]'], driver: 'date', datePrecision: 'day' },
    { profilePath: 'education.startDate', labels: ['入学年月', '本科入学年月'], selectors: ['input[id*="rxny" i]', 'input[id*="txtrxny" i]'], driver: 'month-picker', datePrecision: 'month' },
    { profilePath: 'education.endDate', labels: ['毕业年月', '预计毕业年月'], selectors: ['input[id*="byny" i]', 'input[id*="bkbyny" i]', 'input[id*="txtbkbyny" i]'], driver: 'month-picker', datePrecision: 'month' },
  ];
  const entries: [string, string, string][] = [
    ['blue-seu', '东南大学', 'gsas.seu.edu.cn'],
    ['blue-fudan', '复旦大学', 'gsas.fudan.edu.cn'],
    ['blue-cags', '中国地质科学院', 'gsas.cags.ac.cn'],
    ['blue-ustc', '中国科学技术大学', 'xspt.ustc.edu.cn'],
    ['blue-bit', '北京理工大学', 'yz.bit.edu.cn'],
    ['blue-tongji', '同济大学', 'yzbm.tongji.edu.cn'],
    ['blue-xjtu', '西安交通大学', 'yzbm.xjtu.edu.cn'],
    ['blue-uestc', '电子科技大学', 'yzbm.uestc.edu.cn'],
    ['blue-cupl', '中国政法大学', 'yzbm.cupl.edu.cn'],
    ['blue-cpu', '中国药科大学', 'yzs.cpu.edu.cn'],
    ['blue-cup', '中国石油大学', 'gmss.cup.edu.cn'],
    ['blue-cau', '中国农业大学', 'yzk.cau.edu.cn'],
    ['blue-buct', '北京化工大学', 'yzbm.buct.edu.cn'],
    ['blue-hfut', '合肥工业大学', 'yzbm.hfut.edu.cn'],
    ['blue-sustech', '南方科技大学', 'yzbm.sustech.edu.cn'],
  ];
  return entries.map(([id, schoolName, host]) =>
    pkg(
      id, schoolName, '通用报名', 'blue', [host], ['*/logon*', '*/apply*', '*/edit*'],
      [{ ...page('form', '报名信息', 'form', ['*']), fields: BLUE_SCHOOL_MAJOR_FIELDS }],
      { mode: 'guided', pageOrder: ['form'], blockPathPatterns: FORM_SHELL_BLOCKS },
      exp({ sessionCrawl: 'experimental' }),
    ),
  );
}

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
  // 按 host 精确度排序：精确 host（不含 *）优先于通配 host（如 `*`）
  const matches = packages.filter((p) => declarativeMatchUrl(p.match, url));
  if (!matches.length) return undefined;
  const score = (p: SchoolAdapterPackage): number => {
    // 计算 host 精确度分数：精确 host 数越多越具体，得分越高
    const hosts = p.match?.hosts || [];
    let s = 0;
    for (const h of hosts) {
      if (h === '*') s -= 100; // 通配 host 排在最末
      else if (h.startsWith('*.')) s += 5; // 子域通配
      else s += 20; // 精确 host 优先
    }
    // pathPatterns 也参与：精确 > 通配
    const paths = p.match?.pathPatterns || [];
    s += paths.length;
    return s;
  };
  return matches.sort((a, b) => score(b) - score(a))[0];
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

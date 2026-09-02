"use strict";

// src/core/adapters.ts
function globRegex(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}
function declarativeMatchUrl(rule, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (!rule.hosts.some((h) => h === "*" || host === h.toLowerCase() || h.startsWith("*.") && host.endsWith(h.slice(1).toLowerCase()))) return false;
  const path = `${url.pathname}${url.search}`;
  if (rule.excludePathPatterns?.some((p) => globRegex(p).test(path))) return false;
  return !rule.pathPatterns?.length || rule.pathPatterns.some((p) => globRegex(p).test(path));
}

// src/core/adapter-packages.ts
var exp = (overrides = {}) => ({
  registerFill: "directory",
  formFill: "experimental",
  pluginExtract: "experimental",
  sessionCrawl: "directory",
  ...overrides
});
var page = (id, name, role, pathPatterns, requiredSelectors = []) => ({ id, name, role, pathPatterns, requiredSelectors });
var pkg = (id, schoolName, programName, family, hosts, pathPatterns, pages, crawl, capabilities = exp(), projectionPolicy = "default", commitPolicy = "manual-save-only") => ({
  schemaVersion: 1,
  id,
  version: "2026.08.27.1",
  minCoreVersion: "2.0.0",
  schoolName,
  programName,
  family,
  match: { hosts, pathPatterns },
  capabilities,
  pages,
  crawl,
  projectionPolicy,
  codeNamespaces: [`adapter:${id}`, "moe.school", "moe.major"],
  commitPolicy
});
var FORM_SHELL_BLOCKS = ["*login*", "*signin*", "*register*", "*reset*", "*print*", "*result*", "*upload*"];
var commonSchoolMajorDateFields = (componentDriver) => [
  {
    profilePath: "education.university",
    labels: ["\u672C\u79D1\u9662\u6821", "\u672C\u79D1\u6BD5\u4E1A\u9662\u6821", "\u672C\u79D1\u6BD5\u4E1A\u5B66\u6821", "\u6BD5\u4E1A\u9662\u6821", "\u6BD5\u4E1A\u5B66\u6821"],
    selectors: ['input[name*="bkbyxx" i]', 'input[name*="bkbydw" i]', 'select[name*="bkbyxx" i]', 'select[name*="school" i]'],
    driver: "school-picker",
    componentDriver,
    codeNamespace: "moe.school"
  },
  {
    profilePath: "education.major",
    labels: ["\u672C\u79D1\u4E13\u4E1A", "\u672C\u79D1\u6240\u5B66\u4E13\u4E1A", "\u6240\u5B66\u4E13\u4E1A"],
    selectors: ['input[name*="bkzy" i]', 'select[name*="bkzy" i]', 'input[name*="major" i]', 'select[name*="major" i]'],
    driver: "major-picker",
    componentDriver,
    codeNamespace: "moe.major"
  },
  { profilePath: "basic.birthday", labels: ["\u51FA\u751F\u65E5\u671F", "\u51FA\u751F\u5E74\u6708"], selectors: ['input[name*="csrq" i]', 'input[name*="birth" i]'], driver: "date", datePrecision: "day" },
  { profilePath: "education.startDate", labels: ["\u672C\u79D1\u5165\u5B66\u5E74\u6708", "\u5165\u5B66\u5E74\u6708", "\u5165\u5B66\u65F6\u95F4"], selectors: ['input[name*="rxny" i]', 'input[name*="rxsj" i]', 'input[name*="start" i]'], driver: "month-picker", datePrecision: "month" },
  { profilePath: "education.endDate", labels: ["\u672C\u79D1\u6BD5\u4E1A\u5E74\u6708", "\u9884\u8BA1\u6BD5\u4E1A\u5E74\u6708", "\u6BD5\u4E1A\u65F6\u95F4"], selectors: ['input[name*="byny" i]', 'input[name*="bysj" i]', 'input[name*="end" i]'], driver: "month-picker", datePrecision: "month" }
];
var minimalSchoolMajorFields = [
  {
    profilePath: "education.university",
    selectors: ["#txtBkbydwmc", '[name="txtBkbydwmc"]', "#ctl00_contentParent_txtBkbydwmc"],
    codeSelectors: ["#txtBkbydwm", '[name="txtBkbydwm"]', "#ctl00_contentParent_txtBkbydwm"],
    nameSelectors: ["#txtBkbydwmc", '[name="txtBkbydwmc"]', "#ctl00_contentParent_txtBkbydwmc"],
    driver: "school-picker",
    codeNamespace: "moe.school",
    picker: {
      triggerSelectors: ["#hykSelBkBydw", 'a[id*="SelBkBydw"]'],
      frameNames: ["SelUniversity"],
      frameSrcPatterns: ["*SelUniversity*"],
      searchInputSelectors: ["#txtWord", '[name="txtWord"]'],
      queryButtonSelectors: ['input[value="\u67E5\u8BE2"]', "a"],
      resultRowSelectors: ["table tr"],
      chooseSelectors: ['input[type="image"]', "a", 'input[type="button"]']
    }
  },
  {
    profilePath: "education.major",
    selectors: ["#txtBkzymc", '[name="txtBkzymc"]', "#ctl00_contentParent_txtBkzymc"],
    codeSelectors: ["#txtBkzydm", '[name="txtBkzydm"]', "#ctl00_contentParent_txtBkzydm"],
    nameSelectors: ["#txtBkzymc", '[name="txtBkzymc"]', "#ctl00_contentParent_txtBkzymc"],
    driver: "major-picker",
    codeNamespace: "moe.major",
    picker: {
      triggerSelectors: ["#hykSelfszydm", 'a[id*="Selfszydm"]', "#hykSelBkzydm", 'a[id*="SelBkzydm"]'],
      frameNames: ["SelBkdzZydm", "SelMajor", "SelSubject", "Selfszydm"],
      frameSrcPatterns: ["*SelBkdzZydm*", "*SelMajor*", "*SelSubject*", "*Selfszydm*"],
      searchInputSelectors: ["#txtWord", '[name="txtWord"]'],
      queryButtonSelectors: ['input[value="\u67E5\u8BE2"]', "a"],
      categorySelectSelectors: ["select"],
      resultRowSelectors: ["table tr"],
      chooseSelectors: ['input[type="image"]', "a", 'input[type="button"]']
    }
  },
  ...commonSchoolMajorDateFields().filter((field) => !["education.university", "education.major"].includes(field.profilePath || ""))
];
var blueTripleSchoolMajorFields = () => [
  {
    nativeId: "bkbydwShow",
    profilePath: "education.university",
    driver: "school-picker",
    codeNamespace: "moe.school",
    codeSelectors: ["#bydwm", '[name="bydwm"]'],
    nameSelectors: ["#bydw", '[name="bydw"]'],
    displaySelectors: ["#bkbydwShow", '[name="bkbydwShow"]'],
    picker: {
      protocol: "blue-flat",
      triggerSelectors: ['span.addon[onclick*="chooseSch"]', "#bkbydwShow + span.addon", "#bkbydwShow ~ span.addon"],
      frameNames: ["chooseSch", "SelUniversity", "universitySelectPage"],
      frameSrcPatterns: ["*chooseSch*", "*SelUniversity*", "*universitySelectPage*", "*school*", "*university*"],
      searchInputSelectors: ['input[type="text"]'],
      queryButtonSelectors: ["button", "a", 'input[type="button"]'],
      resultRowSelectors: ["table tr"],
      chooseSelectors: ["[onclick]", "span", "td", "tr"]
    }
  },
  {
    nativeId: "bkbyzyShow",
    profilePath: "education.major",
    driver: "major-picker",
    codeNamespace: "moe.major",
    codeSelectors: ["#byzydm", '[name="byzydm"]'],
    nameSelectors: ["#byzymc", '[name="byzymc"]'],
    displaySelectors: ["#bkbyzyShow", '[name="bkbyzyShow"]'],
    picker: {
      protocol: "blue-flat",
      triggerSelectors: ['span.addon[onclick*="chooseZy"]', "#bkbyzyShow + span.addon", "#bkbyzyShow ~ span.addon"],
      frameNames: ["chooseZy", "SelMajor", "SelSubject", "SelBkdzZydm", "majorSelectPage"],
      frameSrcPatterns: ["*chooseZy*", "*SelMajor*", "*SelSubject*", "*SelBkdzZydm*", "*majorSelectPage*", "*major*", "*specialty*"],
      searchInputSelectors: ['input[type="text"]'],
      queryButtonSelectors: ["button", "a", 'input[type="button"]'],
      resultRowSelectors: ["table tr"],
      chooseSelectors: ["[onclick]", "span", "td", "tr"]
    }
  },
  { nativeId: "rxny", profilePath: "education.startDate", driver: "month-picker", datePrecision: "month", dateFormat: "yyyyMM" },
  { nativeId: "byny", profilePath: "education.endDate", driver: "month-picker", datePrecision: "month", dateFormat: "yyyyMM" }
];
var SCHOOL_ADAPTER_PACKAGES = [
  pkg(
    "lzu-ytms",
    "\u5170\u5DDE\u5927\u5B66",
    "\u9884\u63A8\u514D",
    "other",
    ["yjszs.lzu.edu.cn"],
    ["*/lzuyjsytms/*"],
    [
      page("workspace", "\u5DE5\u4F5C\u533A", "shell", ["*/wlogin.html", "*/main*"]),
      { ...page("information", "\u4FE1\u606F\u586B\u62A5", "form", ["*/info*", "*/edit*", "*/main*"], ["#xm"]), safeNavigationSelectors: ["a,button"], fields: [
        { nativeId: "xm", profilePath: "basic.name", driver: "text" },
        { nativeId: "zjlx", profilePath: "basic.idType", driver: "text" },
        { nativeId: "zjhm", profilePath: "basic.idCard", driver: "text" },
        { nativeId: "csrq", profilePath: "basic.birthday", driver: "date" },
        { nativeId: "mz", profilePath: "basic.nation", driver: "text" },
        { nativeId: "xb", profilePath: "basic.gender", driver: "radio" },
        { nativeId: "zzmm", profilePath: "basic.politicalStatus", driver: "layui", codeNamespace: "adapter:lzu-ytms" },
        { nativeId: "xyjr", profilePath: "basic.militaryStatus", driver: "text" },
        { nativeId: "rxnf", profilePath: "education.startDate", driver: "date" },
        { nativeId: "bkbyny", profilePath: "education.endDate", driver: "date" },
        { nativeId: "bkbysf", profilePath: "education.province", driver: "layui" },
        { nativeId: "bkbyxx", profilePath: "education.university", driver: "school-picker", componentDriver: "layui", codeNamespace: "moe.school" },
        { nativeId: "bkbyxy", profilePath: "education.college", driver: "layui" },
        { nativeId: "bkbyzy3", profilePath: "education.major", driver: "major-picker", componentDriver: "layui", codeNamespace: "moe.major" },
        { nativeId: "szzytnjzrs", profilePath: "education.rankBase", driver: "text" },
        { nativeId: "zhcjpm", profilePath: "education.comprehensiveRank", driver: "text" },
        { nativeId: "wgyspqt", profilePath: "education.otherExams", driver: "text" },
        { nativeId: "dzyj", profilePath: "basic.email", driver: "text" },
        { nativeId: "txdz", profilePath: "basic.address", driver: "text" },
        { nativeId: "yzbm", profilePath: "basic.postalCode", driver: "text" },
        { nativeId: "bkxy", profilePath: "applications.0.college", driver: "layui", codeNamespace: "adapter:lzu-ytms" },
        { nativeId: "bkzy", profilePath: "applications.0.major", driver: "layui", codeNamespace: "adapter:lzu-ytms" },
        { nativeId: "bkyjfx", profilePath: "applications.0.direction", driver: "layui", codeNamespace: "adapter:lzu-ytms" },
        { nativeId: "sftj", profilePath: "education.obeyAdjust", driver: "layui" },
        { nativeId: "brcs", extensionKey: "personalStatement", driver: "textarea" },
        { nativeId: "xxhgzjlTable", extensionKey: "studyRows", driver: "table" },
        { nativeId: "kyqkTable", extensionKey: "researchRows", driver: "table" },
        { nativeId: "jlhcfqkTable", extensionKey: "awardRows", driver: "table" }
      ] },
      page("upload", "\u6750\u6599\u4E0A\u4F20", "upload", ["*upload*", "*file*"])
    ],
    { mode: "plugin", pageOrder: ["information"], blockPathPatterns: FORM_SHELL_BLOCKS },
    exp({ sessionCrawl: "directory" })
  ),
  pkg(
    "shmtu-sszs",
    "\u4E0A\u6D77\u6D77\u4E8B\u5927\u5B66",
    "\u9884\u63A8\u514D",
    "other",
    ["zhaosheng.eol.cn"],
    ["/10254/*"],
    [
      page("project", "\u9009\u62E9\u62DB\u751F\u9879\u76EE", "shell", ["/10254/*project*", "/10254/*program*"]),
      { ...page("study", "\u5B66\u4E1A\u4FE1\u606F", "form", ["/10254/*"], ['select[name="edu_school_pro"],select[name="edu_school"]']), fields: [
        { nativeId: "edu_school", profilePath: "education.university", driver: "school-picker", componentDriver: "select2", codeNamespace: "moe.school" },
        { nativeId: "edu_major", profilePath: "education.major", driver: "major-picker", componentDriver: "select2", codeNamespace: "moe.major" },
        ...commonSchoolMajorDateFields("select2").filter((field) => !["education.university", "education.major"].includes(field.profilePath || ""))
      ] },
      page("basic", "\u57FA\u672C\u4FE1\u606F", "form", ["/10254/*"], ["input,select,textarea"]),
      page("application", "\u7533\u8BF7\u4FE1\u606F", "form", ["/10254/*"], ["input,select,textarea"]),
      page("honors", "\u8363\u8A89\u4E0E\u6210\u679C", "form", ["/10254/*"], ["textarea,input"]),
      page("upload", "\u4E0A\u4F20\u6750\u6599", "upload", ["/10254/*upload*", "/10254/*file*"])
    ],
    { mode: "guided", pageOrder: ["basic", "study", "application", "honors"], blockPathPatterns: FORM_SHELL_BLOCKS },
    exp()
  ),
  pkg(
    "zuel-360eol-xly",
    "\u4E2D\u5357\u8D22\u7ECF\u653F\u6CD5\u5927\u5B66",
    "\u590F\u4EE4\u8425",
    "other",
    ["zncjzf.form.360eol.com", "yzb.zuel.edu.cn"],
    ["*"],
    [
      page("shell", "\u767B\u5F55/\u6C47\u603B", "shell", ["*/enroll/*", "*/registered*", "*/reset_password*", "*/c4644a434937*", "*/c4641a431789*", "*/c4639a434937*"]),
      { ...page("personal", "\u4E2A\u4EBA\u4FE1\u606F", "form", ["*/user/*", "*/student/*", "*/apply/*"], ["input,select,textarea"]), fields: commonSchoolMajorDateFields() },
      { ...page("education", "\u6559\u80B2\u4FE1\u606F", "form", ["*/user/*", "*/student/*", "*/apply/*"], ["input,select,textarea"]), fields: commonSchoolMajorDateFields() }
    ],
    { mode: "guided", pageOrder: ["personal", "education"], blockPathPatterns: FORM_SHELL_BLOCKS },
    exp()
  ),
  pkg(
    "minimal-bupt-mastertm",
    "\u5317\u4EAC\u90AE\u7535\u5927\u5B66",
    "\u9884\u63A8\u514D",
    "minimal",
    ["yzfs.bupt.edu.cn"],
    ["/MasterTm/*"],
    [page("selection", "\u62A5\u540D\u8BB0\u5F55", "crawl-only", ["/MasterTm/ExamineeViewSel.aspx"]), { ...page("apply", "\u8EAB\u4EFD\u4E0E\u5B66\u4E1A\u4FE1\u606F", "form", ["/MasterTm/Apply*.aspx"]), fields: minimalSchoolMajorFields }],
    { mode: "session", readOnlyPaths: ["/MasterTm/ExamineeViewSel.aspx", "/MasterTm/Apply.aspx", "/MasterTm/Apply1.aspx", "/MasterTm/Apply2.aspx", "/MasterTm/Apply3.aspx"], pageOrder: ["selection", "apply"], blockPathPatterns: FORM_SHELL_BLOCKS },
    exp({ sessionCrawl: "experimental" })
  ),
  pkg(
    "minimal-njust-tm",
    "\u5357\u4EAC\u7406\u5DE5\u5927\u5B66",
    "\u9884\u63A8\u514D",
    "minimal",
    ["202.119.85.163"],
    ["/Open/RecruitTkssTmYbm/*"],
    [{ ...page("apply", "\u9884\u63A8\u514D\u62A5\u540D\u4FE1\u606F", "form", ["/Open/RecruitTkssTmYbm/ExamineeEditTmYbm*.aspx"]), fields: minimalSchoolMajorFields }],
    { mode: "session", readOnlyPaths: ["/Open/RecruitTkssTmYbm/ExamineeEditTmYbm.aspx", "/Open/RecruitTkssTmYbm/ExamineeEditTmYbm1.aspx", "/Open/RecruitTkssTmYbm/ExamineeEditTmYbm2.aspx", "/Open/RecruitTkssTmYbm/ExamineeEditTmYbm3.aspx", "/Open/RecruitTkssTmYbm/ExamineeEditTmYbm4.aspx", "/Open/RecruitTkssTmYbm/ExamineeEditTmYbm5.aspx"], pageOrder: ["apply"], blockPathPatterns: FORM_SHELL_BLOCKS },
    exp({ sessionCrawl: "experimental" })
  ),
  pkg("minimal-njust-xly", "\u5357\u4EAC\u7406\u5DE5\u5927\u5B66", "\u590F\u4EE4\u8425", "minimal", ["202.119.85.163"], ["/Open/ZsTkssXly/*"], [{ ...page("apply", "\u590F\u4EE4\u8425\u62A5\u540D\u4FE1\u606F", "form", ["/Open/ZsTkssXly/*"]), fields: minimalSchoolMajorFields }], { mode: "guided", pageOrder: ["apply"], blockPathPatterns: FORM_SHELL_BLOCKS }),
  pkg(
    "hfut-blue-tm",
    "\u5408\u80A5\u5DE5\u4E1A\u5927\u5B66",
    "\u63A8\u514D\u62A5\u540D",
    "blue",
    ["yzbm.hfut.edu.cn"],
    ["/sstm/*"],
    [{
      // 合工大 12 步向导共用 /sstm/ 加密路径，基本信息页通过稳定字段组合识别。
      ...page("basic", "\u57FA\u672C\u4FE1\u606F", "form", ["/sstm/*"], ["#xm", "#xmpy", "#mz", "button.button.bg-sub"]),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ["button.button.bg-sub", 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: [".field-validation-error", ".validation-error", ".has-error", ".error", ".easyui-validatebox-invalid", '[aria-invalid="true"]']
    }, {
      ...page("education", "\u5B66\u4E60\u4FE1\u606F", "form", ["/sstm/*"], ["#bkbydwShow", "#bkbyzyShow", "#rxny", "#byny", "button.button.bg-sub"]),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ["button.button.bg-sub", 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: [".field-validation-error", ".validation-error", ".has-error", ".error", ".easyui-validatebox-invalid", '[aria-invalid="true"]'],
      fields: blueTripleSchoolMajorFields()
    }, {
      ...page("language", "\u5916\u8BED\u6C34\u5E73", "form", ["/sstm/*"], ['select[id^="lbmc"]', 'input[id^="cj"]', "button.button.bg-sub"]),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ["button.button.bg-sub", 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: [".field-validation-error", ".validation-error", ".has-error", ".error", ".easyui-validatebox-invalid", '[aria-invalid="true"]']
    }, {
      // 其余加密步骤只在出现真实 button 下一步且没有上传控件时开放；导航内核还会按按钮文字二次拦截提交。
      ...page("safe-form-step", "\u62A5\u540D\u8868\u5355\u6B65\u9AA4", "form", ["/sstm/*"], ["button.button.bg-sub"]),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ["button.button.bg-sub", 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: [".field-validation-error", ".validation-error", ".has-error", ".error", ".easyui-validatebox-invalid", '[aria-invalid="true"]'],
      fields: commonSchoolMajorDateFields()
    }],
    { mode: "guided", pageOrder: ["basic", "education", "language", "safe-form-step"], blockPathPatterns: FORM_SHELL_BLOCKS },
    exp({ sessionCrawl: "experimental" }),
    "blue",
    "validated-next-only"
  ),
  pkg(
    "ustb-blue-xly",
    "\u5317\u4EAC\u79D1\u6280\u5927\u5B66",
    "\u590F\u4EE4\u8425",
    "blue",
    ["yjsy.ustb.edu.cn"],
    ["/ksxt/ssxly/*"],
    [{
      ...page("education", "\u6559\u80B2\u4FE1\u606F", "form", ["/ksxt/ssxly/*"], ["#bkbydwShow", "#bkbyzyShow", "#rxny", "#byny"]),
      nextSelectors: ["button.button.bg-sub", 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: [".field-validation-error", ".has-error", ".error", ".easyui-validatebox-invalid", '[aria-invalid="true"]'],
      fields: [
        {
          nativeId: "bkbydwShow",
          profilePath: "education.university",
          driver: "school-picker",
          codeNamespace: "moe.school",
          codeSelectors: ["#bydwm", '[name="bydwm"]'],
          nameSelectors: ["#bydw", '[name="bydw"]'],
          displaySelectors: ["#bkbydwShow", '[name="bkbydwShow"]'],
          picker: {
            protocol: "blue-flat",
            triggerSelectors: ['span.addon[onclick*="chooseSch"]', "#bkbydwShow + span.addon", "#bkbydwShow ~ span.addon"],
            frameNames: ["chooseSch", "SelUniversity"],
            frameSrcPatterns: ["*chooseSch*", "*school*", "*university*"],
            searchInputSelectors: ['input[type="text"]'],
            queryButtonSelectors: ["button", "a", 'input[type="button"]'],
            resultRowSelectors: ["table tr"],
            chooseSelectors: ["[onclick]", "span", "td", "tr"]
          }
        },
        {
          nativeId: "bkbyzyShow",
          profilePath: "education.major",
          driver: "major-picker",
          codeNamespace: "moe.major",
          codeSelectors: ["#byzydm", '[name="byzydm"]'],
          nameSelectors: ["#byzymc", '[name="byzymc"]'],
          displaySelectors: ["#bkbyzyShow", '[name="bkbyzyShow"]'],
          picker: {
            protocol: "blue-flat",
            triggerSelectors: ['span.addon[onclick*="chooseZy"]', "#bkbyzyShow + span.addon", "#bkbyzyShow ~ span.addon"],
            frameNames: ["chooseZy", "SelMajor", "SelSubject", "SelBkdzZydm"],
            frameSrcPatterns: ["*chooseZy*", "*SelMajor*", "*SelSubject*", "*SelBkdzZydm*", "*major*", "*specialty*"],
            searchInputSelectors: ['input[type="text"]'],
            queryButtonSelectors: ["button", "a", 'input[type="button"]'],
            resultRowSelectors: ["table tr"],
            chooseSelectors: ["[onclick]", "span", "td", "tr"]
          }
        },
        { nativeId: "rxny", profilePath: "education.startDate", driver: "month-picker", datePrecision: "month", dateFormat: "yyyyMM" },
        { nativeId: "byny", profilePath: "education.endDate", driver: "month-picker", datePrecision: "month", dateFormat: "yyyyMM" }
      ]
    }, {
      ...page("language", "\u5916\u8BED\u6C34\u5E73", "form", ["/ksxt/ssxly/*"], ['select[id^="lbmc"]', 'input[id^="cj"]', 'input[id^="sj"]']),
      nextSelectors: ["button.button.bg-sub", 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: [".field-validation-error", ".has-error", ".error", ".easyui-validatebox-invalid", '[aria-invalid="true"]']
    }, {
      // 北科大 13 步报名页使用同一条加密 URL，无法按 pathname 区分各步骤。
      // 只把存在蓝色“下一步”候选且不含上传控件的页面纳入连续填写；按钮文字仍由导航内核严格二次校验。
      ...page("safe-form-step", "\u62A5\u540D\u8868\u5355\u6B65\u9AA4", "form", ["/ksxt/ssxly/*"], ["button.button.bg-sub"]),
      forbiddenSelectors: ['input[type="file"]'],
      nextSelectors: ["button.button.bg-sub", 'button[type="submit"]', 'input[type="submit"]'],
      validationErrorSelectors: [".field-validation-error", ".has-error", ".error", ".easyui-validatebox-invalid", '[aria-invalid="true"]']
    }],
    { mode: "guided", pageOrder: ["education", "language", "safe-form-step"], blockPathPatterns: FORM_SHELL_BLOCKS },
    exp({ sessionCrawl: "experimental" }),
    "blue",
    "validated-next-only"
  ),
  pkg("platform-blue", "\u84DD\u8272\u7CFB\u7EDF", "\u901A\u7528\u62A5\u540D", "blue", ["*"], ["*/logon*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*/apply*", "*/edit*", "*/info*"]), fields: commonSchoolMajorDateFields("layui") }], { mode: "guided", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" }), "blue"),
  // 蓝色系统专属适配包：schools.ts 中已标记 adapter:"blue-xxx" 的学校。
  // 这些学校使用 Layui 弹窗 chooseSch/chooseZy，通过 blue-flat 协议完成院校/专业三联回填。
  // 优先级高于 platform-blue（通配），因为更具体的 host 匹配会先被 resolveAdapters 命中。
  ...buildBlueSchoolAdapterPackages(),
  pkg("platform-jingzhi", "\u7CBE\u81F4\u7CFB\u7EDF", "\u901A\u7528\u62A5\u540D", "jingzhi", ["*"], ["*/zsgl/*", "*/tmsgl/*", "*/xlygl/*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F\u586B\u5199", "form", ["*edit*", "*apply*"]), fields: commonSchoolMajorDateFields("element") }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }),
  // 复古 ASP 系统预推免（统一契约）：蓝三联 + drpbyyx 复用
  // 蓝三联：bydwm/bydw/bkbydwShow 弹出 chooseSch 选院校；byzydm/byzymc/bkbyzyShow 弹出 chooseZy 选专业
  // drpbyyx 下拉：中南/南农/华电等常用，无弹窗即可选院校
  // 奖励项：txthjmc/txthjsj/txtpm 静态槽（retro-honor-fill.ts 接管）
  ...(() => {
    const RETRO_SCHOOL_MAJOR_FIELDS = [
      {
        profilePath: "education.university",
        labels: ["\u6BD5\u4E1A\u9662\u6821", "\u672C\u79D1\u6BD5\u4E1A\u9662\u6821", "\u6BD5\u4E1A\u5B66\u6821", "\u672C\u79D1\u5B66\u6821", "\u6240\u5728\u5B66\u6821", "\u5B66\u751F\u6765\u6E90\u5B66\u6821"],
        selectors: ['input[id*="drpbyyx" i]', 'select[id*="drpbyyx" i]', 'input[id*="bydwm" i]', 'input[id*="bydw" i]', 'input[id*="bkbydwShow" i]', 'input[id*="txtszyxmc" i]'],
        driver: "school-picker",
        codeSelectors: ['input[id*="bydwm" i]', 'input[name*="bydwm" i]'],
        nameSelectors: ['input[id*="bydw" i]', 'input[name*="bydw" i]', 'input[id*="bkbydwShow" i]', 'input[id*="txtszyxmc" i]'],
        displaySelectors: ['input[id*="bkbydwShow" i]', 'input[name*="bkbydwShow" i]'],
        codeNamespace: "moe.school",
        picker: {
          protocol: "blue-flat",
          triggerSelectors: ['span.addon[onclick*="chooseSch"]', 'span.addon[onclick*="chooseYx"]', 'a[onclick*="chooseSch"]', 'a[onclick*="chooseYx"]'],
          frameNames: ["chooseSch", "chooseYx", "SelUniversity", "universitySelectPage", "SchoolPage"],
          frameSrcPatterns: ["*chooseSch*", "*chooseYx*", "*SelUniversity*", "*universitySelectPage*", "*school*", "*university*"],
          searchInputSelectors: ['input[type="text"]', "input.search", 'input[name="key"]', "#key"],
          queryButtonSelectors: ["button", "a", 'input[type="button"]', 'input[value="\u67E5\u8BE2"]', 'input[value="\u641C\u7D22"]'],
          resultRowSelectors: ["table tr", "li.result", "tr.trbg"],
          chooseSelectors: ['input[type="image"]', "a", 'input[type="button"]', "span[onclick]", "td[onclick]", "tr[onclick]"]
        }
      },
      {
        profilePath: "education.major",
        labels: ["\u6BD5\u4E1A\u4E13\u4E1A", "\u672C\u79D1\u4E13\u4E1A", "\u6240\u5B66\u4E13\u4E1A", "\u4E13\u4E1A\u540D\u79F0"],
        selectors: ['input[id*="byzymc" i]', 'input[id*="byzy" i]', 'input[id*="txtbyzy" i]', 'input[id*="bkbyzyShow" i]'],
        driver: "major-picker",
        codeSelectors: ['input[id*="byzydm" i]', 'input[name*="byzydm" i]'],
        nameSelectors: ['input[id*="byzymc" i]', 'input[id*="byzy" i]', 'input[id*="txtbyzy" i]', 'input[id*="bkbyzyShow" i]'],
        displaySelectors: ['input[id*="bkbyzyShow" i]', 'input[name*="bkbyzyShow" i]'],
        codeNamespace: "moe.major",
        picker: {
          protocol: "blue-flat",
          triggerSelectors: ['span.addon[onclick*="chooseZy"]', 'span.addon[onclick*="chooseZydm"]', 'a[onclick*="chooseZy"]'],
          frameNames: ["chooseZy", "chooseZydm", "SelMajor", "SelSubject", "SelBkdzZydm", "majorSelectPage", "MajorPage"],
          frameSrcPatterns: ["*chooseZy*", "*chooseZydm*", "*SelMajor*", "*SelSubject*", "*SelBkdzZydm*", "*majorSelectPage*", "*major*", "*specialty*"],
          searchInputSelectors: ['input[type="text"]', "input.search", 'input[name="key"]', "#key"],
          queryButtonSelectors: ["button", "a", 'input[type="button"]', 'input[value="\u67E5\u8BE2"]', 'input[value="\u641C\u7D22"]'],
          resultRowSelectors: ["table tr", "li.result", "tr.trbg"],
          chooseSelectors: ['input[type="image"]', "a", 'input[type="button"]', "span[onclick]", "td[onclick]", "tr[onclick]"]
        }
      },
      { profilePath: "education.college", labels: ["\u6240\u5728\u9662\u7CFB", "\u9662\u7CFB", "\u5B66\u9662", "\u6240\u5C5E\u5B66\u9662"], selectors: ['input[id*="szxy" i]', 'input[id*="yxmc" i]', 'input[id*="txtszxy" i]'], driver: "text" },
      { profilePath: "basic.birthday", labels: ["\u51FA\u751F\u65E5\u671F", "\u51FA\u751F\u5E74\u6708"], selectors: ['input[id*="csrq" i]', 'input[id*="txtcsrq" i]'], driver: "date", datePrecision: "day" },
      { profilePath: "education.startDate", labels: ["\u5165\u5B66\u5E74\u6708", "\u672C\u79D1\u5165\u5B66\u5E74\u6708", "\u5165\u5B66\u65F6\u95F4"], selectors: ['input[id*="rxny" i]', 'input[id*="txtrxny" i]'], driver: "month-picker", datePrecision: "month" },
      { profilePath: "education.endDate", labels: ["\u6BD5\u4E1A\u5E74\u6708", "\u9884\u8BA1\u6BD5\u4E1A\u5E74\u6708", "\u6BD5\u4E1A\u65F6\u95F4"], selectors: ['input[id*="byny" i]', 'input[id*="bkbyny" i]', 'input[id*="txtbkbyny" i]'], driver: "month-picker", datePrecision: "month" }
    ];
    return [
      // [id, 学校名, 域名, pathPatterns]
      ["retro-tmsgl-csu", "\u4E2D\u5357\u5927\u5B66", "yjszsgl.csu.edu.cn", ["*/zsgl2026/*", "*/zsgl/*", "*/tmsgl/*"]],
      ["retro-tmsgl-hnu", "\u6E56\u5357\u5927\u5B66", "yjszsxt.hnu.edu.cn", ["*/zsxt2026/*", "*/zsxt/*", "*/tmsgl/*"]],
      ["retro-tmsgl-jiangnan", "\u6C5F\u5357\u5927\u5B66", "yzgmis.jiangnan.edu.cn", ["*/zsgl/*", "*/tmsgl/*", "*/register*"]],
      ["retro-tmsgl-njau", "\u5357\u4EAC\u519C\u4E1A\u5927\u5B66", "yzglxt.njau.edu.cn", ["*/gts/*", "*/tmsgl/*"]],
      ["retro-tmsgl-ncepu", "\u534E\u5317\u7535\u529B\u5927\u5B66", "yjszs.ncepu.edu.cn", ["*/zsgl/*", "*/tmsgl/*"]],
      ["retro-tmsgl-ujs", "\u6C5F\u82CF\u5927\u5B66", "yjszsgl.ujs.edu.cn", ["*/zsgl/*", "*/tmsgl/*"]],
      ["retro-tmsgl-hnucm", "\u6E56\u5357\u4E2D\u533B\u836F\u5927\u5B66", "yjsxt.hnucm.edu.cn", ["*/zsgl/*", "*/tmsgl/*"]],
      ["retro-tmsgl-sjtu", "\u4E0A\u6D77\u4EA4\u901A\u5927\u5B66", "ga.sjtu.edu.cn", ["*/zsgl/*", "*/ytmgl/*", "*/xlygl/*"]],
      ["retro-tmsgl-bjut", "\u5317\u4EAC\u5DE5\u4E1A\u5927\u5B66", "webrecdoc.bjut.edu.cn", ["*/zsgl/*", "*/tmsgl/*", "*/xlygl/*"]]
    ].map(
      ([id, schoolName, host, pathPatterns]) => pkg(
        id,
        schoolName,
        "\u9884\u63A8\u514D",
        "jingzhi",
        [host],
        pathPatterns,
        [
          page("shell", "\u767B\u5F55/\u9879\u76EE\u9009\u62E9", "shell", ["*login*", "*tmsgl*", "*register*"]),
          { ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"], ["input,select,textarea"]), fields: RETRO_SCHOOL_MAJOR_FIELDS }
        ],
        { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS },
        exp({ sessionCrawl: "experimental" })
      )
    );
  })(),
  pkg("platform-cover", "\u5C01\u9762\u7CFB\u7EDF", "\u901A\u7528\u62A5\u540D", "cover", ["*"], ["*/gsapp/sys/*", "*/geapp/sys/*"], [{ ...page("form", "\u586B\u62A5\u9875\u9762", "form", ["*entrance*", "*apply*", "*info*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }),
  pkg("muc-tm", "\u4E2D\u592E\u6C11\u65CF\u5927\u5B66", "\u9884\u63A8\u514D", "other", ["yjszs.muc.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("xmu-pre", "\u53A6\u95E8\u5927\u5B66", "\u9884\u63A8\u514D", "other", ["ssyjsbm.xmu.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u5DE5\u4F5C\u533A", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("njnu-pre", "\u5357\u4EAC\u5E08\u8303\u5927\u5B66", "\u9884\u63A8\u514D", "other", ["yz.njnu.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u5411\u5BFC", "form", ["*"]), fields: commonSchoolMajorDateFields("element") }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("swufe-pre", "\u897F\u5357\u8D22\u7ECF\u5927\u5B66", "\u9884\u63A8\u514D", "other", ["yjsbm.swufe.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u5411\u5BFC", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("nankai-pre", "\u5357\u5F00\u5927\u5B66", "\u9884\u63A8\u514D", "other", ["yzxt.nankai.edu.cn"], ["*"], [page("register", "\u6CE8\u518C", "shell", ["*register*"]), { ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ registerFill: "experimental", sessionCrawl: "experimental" })),
  pkg("ruc-pre", "\u4E2D\u56FD\u4EBA\u6C11\u5927\u5B66", "\u9884\u63A8\u514D", "other", ["yjsfs.ruc.edu.cn"], ["*"], [page("register", "\u6CE8\u518C", "shell", ["*register*"]), { ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ registerFill: "experimental", sessionCrawl: "experimental" })),
  ...[
    ["tju-pre", "\u5929\u6D25\u5927\u5B66", "\u9884\u63A8\u514D", "sszs.tju.edu.cn", "default"],
    ["zju-xly-pre", "\u6D59\u6C5F\u5927\u5B66", "\u590F\u4EE4\u8425/\u9884\u63A8\u514D", "yjsy.zju.edu.cn", "zju"],
    ["jlu-xly", "\u5409\u6797\u5927\u5B66", "\u590F\u4EE4\u8425", "yzbbm.jlu.edu.cn", "default"],
    ["kmmu-xly", "\u6606\u660E\u533B\u79D1\u5927\u5B66", "\u590F\u4EE4\u8425", "yjsgl.kmmu.edu.cn", "default"],
    ["gxu-xly", "\u5E7F\u897F\u5927\u5B66", "\u590F\u4EE4\u8425", "yjsglxt.gxu.edu.cn", "default"],
    ["blcu-pre", "\u5317\u4EAC\u8BED\u8A00\u5927\u5B66", "\u9884\u63A8\u514D", "yanzhao.blcu.edu.cn", "default"],
    ["ouc-pre", "\u4E2D\u56FD\u6D77\u6D0B\u5927\u5B66", "\u9884\u63A8\u514D", "stuouc.molstone.cn", "default"],
    ["chd-xly", "\u957F\u5B89\u5927\u5B66", "\u590F\u4EE4\u8425", "yzfw.chd.edu.cn", "default"],
    ["ecust-pre", "\u534E\u4E1C\u7406\u5DE5\u5927\u5B66", "\u9884\u63A8\u514D", "yz.ecust.edu.cn", "default"],
    ["hit-pre", "\u54C8\u5C14\u6EE8\u5DE5\u4E1A\u5927\u5B66", "\u9884\u63A8\u514D", "hityzb.hit.edu.cn", "hit"]
  ].map(([id, school, program, host, projection]) => {
    const component = id === "zju-xly-pre" ? "ant" : ["jlu-xly", "kmmu-xly", "gxu-xly", "blcu-pre", "ouc-pre", "chd-xly"].includes(id) ? "element" : void 0;
    return pkg(id, school, program, "other", [host], ["*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"], ["input,select,textarea"]), fields: commonSchoolMajorDateFields(component) }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ registerFill: id === "chd-xly" ? "experimental" : "directory" }), projection);
  }),
  pkg("ucas-pre", "\u4E2D\u56FD\u79D1\u5B66\u9662\u5927\u5B66", "\u9884\u63A8\u514D", "other", ["zxsq.ucas.ac.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "guided", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ pluginExtract: "directory", sessionCrawl: "directory" })),
  // P3：对照竞品补齐的 cover_system / jingzhi_system / retro_system 学校（与 platform-* 不冲突时优先）
  pkg("gdut-gsapp", "\u5E7F\u4E1C\u5DE5\u4E1A\u5927\u5B66", "\u9884\u63A8\u514D", "cover", ["yjsxt.gdut.edu.cn"], ["*/gsapp/*"], [{ ...page("form", "\u586B\u62A5\u9875\u9762", "form", ["*entrance*", "*apply*", "*info*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("hainanu-gsapp", "\u6D77\u5357\u5927\u5B66", "\u9884\u63A8\u514D", "cover", ["ehall.hainanu.edu.cn"], ["*/gsapp/*"], [{ ...page("form", "\u586B\u62A5\u9875\u9762", "form", ["*entrance*", "*apply*", "*info*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("jnu-gsapp", "\u66A8\u5357\u5927\u5B66", "\u9884\u63A8\u514D", "cover", ["yjsxt.jnu.edu.cn"], ["*/gsapp/*"], [{ ...page("form", "\u586B\u62A5\u9875\u9762", "form", ["*entrance*", "*apply*", "*info*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("gzhu-gsapp", "\u5E7F\u5DDE\u5927\u5B66", "\u9884\u63A8\u514D", "cover", ["yjsyxt.gzhu.edu.cn"], ["*/gsapp/*"], [{ ...page("form", "\u586B\u62A5\u9875\u9762", "form", ["*entrance*", "*apply*", "*info*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("whu-gsapp", "\u6B66\u6C49\u5927\u5B66", "\u9884\u63A8\u514D", "cover", ["yz.whu.edu.cn", "ehall.whu.edu.cn"], ["*"], [{ ...page("form", "\u586B\u62A5\u9875\u9762", "form", ["*entrance*", "*apply*", "*info*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("ucas-tms", "\u4E2D\u56FD\u79D1\u5B66\u9662\u5927\u5B66", "\u63A8\u514D", "other", ["zhaosheng.ucas.ac.cn"], ["*/sign_up/*", "*/TMS/*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("sysu-enroll", "\u4E2D\u5C71\u5927\u5B66", "\u9884\u63A8\u514D", "jingzhi", ["enroll.sysu.edu.cn"], ["*/yjszs/plugins/*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*entrance*"]), fields: commonSchoolMajorDateFields("element") }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("nwafu-yjszs", "\u897F\u5317\u519C\u6797\u79D1\u6280\u5927\u5B66", "\u9884\u63A8\u514D", "jingzhi", ["yjszs.nwafu.edu.cn", "yjszs.nwsuaf.edu.cn"], ["*/yjszs/plugins/*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*entrance*"]), fields: commonSchoolMajorDateFields("element") }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("hunnu-tmsgl", "\u6E56\u5357\u5E08\u8303\u5927\u5B66", "\u9884\u63A8\u514D", "jingzhi", ["yjsyzsxt.hunnu.edu.cn"], ["*/zsxt2025/*", "*/zsxt/*", "*/tmsgl/*"], [
    page("shell", "\u767B\u5F55/\u9879\u76EE\u9009\u62E9", "shell", ["*login*", "*tmsgl*"]),
    { ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"], ["input,select,textarea"]), fields: [
      { profilePath: "education.university", labels: ["\u6BD5\u4E1A\u9662\u6821", "\u672C\u79D1\u6BD5\u4E1A\u9662\u6821", "\u6BD5\u4E1A\u5B66\u6821", "\u672C\u79D1\u5B66\u6821"], selectors: ['input[id*="drpbyyx" i]', 'select[id*="drpbyyx" i]', 'input[id*="bydwm" i]', 'input[id*="bydw" i]', 'input[id*="bkbydwShow" i]'], driver: "school-picker", codeSelectors: ['input[id*="bydwm" i]'], nameSelectors: ['input[id*="bydw" i]', 'input[id*="bkbydwShow" i]'], displaySelectors: ['input[id*="bkbydwShow" i]'], codeNamespace: "moe.school", picker: { protocol: "blue-flat", triggerSelectors: ['span.addon[onclick*="chooseSch"]', 'a[onclick*="chooseSch"]'], frameNames: ["chooseSch", "SelUniversity"], frameSrcPatterns: ["*chooseSch*", "*school*"], searchInputSelectors: ['input[type="text"]'], queryButtonSelectors: ["button", "a", 'input[type="button"]'], resultRowSelectors: ["table tr"], chooseSelectors: ['input[type="image"]', "a", "span[onclick]"] } },
      { profilePath: "education.major", labels: ["\u6BD5\u4E1A\u4E13\u4E1A", "\u672C\u79D1\u4E13\u4E1A", "\u6240\u5B66\u4E13\u4E1A"], selectors: ['input[id*="byzymc" i]', 'input[id*="byzy" i]', 'input[id*="bkbyzyShow" i]'], driver: "major-picker", codeSelectors: ['input[id*="byzydm" i]'], nameSelectors: ['input[id*="byzymc" i]', 'input[id*="bkbyzyShow" i]'], displaySelectors: ['input[id*="bkbyzyShow" i]'], codeNamespace: "moe.major", picker: { protocol: "blue-flat", triggerSelectors: ['span.addon[onclick*="chooseZy"]'], frameNames: ["chooseZy", "SelMajor"], frameSrcPatterns: ["*chooseZy*", "*major*"], searchInputSelectors: ['input[type="text"]'], queryButtonSelectors: ["button", "a", 'input[type="button"]'], resultRowSelectors: ["table tr"], chooseSelectors: ['input[type="image"]', "a", "span[onclick]"] } },
      { profilePath: "basic.birthday", labels: ["\u51FA\u751F\u65E5\u671F", "\u51FA\u751F\u5E74\u6708"], selectors: ['input[id*="csrq" i]'], driver: "date", datePrecision: "day" },
      { profilePath: "education.startDate", labels: ["\u5165\u5B66\u5E74\u6708"], selectors: ['input[id*="rxny" i]'], driver: "month-picker", datePrecision: "month" },
      { profilePath: "education.endDate", labels: ["\u6BD5\u4E1A\u5E74\u6708"], selectors: ['input[id*="byny" i]'], driver: "month-picker", datePrecision: "month" }
    ] }
  ], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  // 中国矿业大学（蓝色系统，已有 platform-blue 通配；这里只补 host 限定，避免路径冲突）
  pkg("blue-cumt", "\u4E2D\u56FD\u77FF\u4E1A\u5927\u5B66", "\u9884\u63A8\u514D", "blue", ["yzs.cumt.edu.cn"], ["*/yzbm/logon*", "*/apply*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields("layui") }], { mode: "guided", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" }), "blue"),
  // 中国地质大学（简约系统，竞品 cug_tms / cug_xly 分支）
  pkg("cug-tms", "\u4E2D\u56FD\u5730\u8D28\u5927\u5B66", "\u9884\u63A8\u514D", "jingzhi", ["epo.cug.edu.cn"], ["*/Open/ZsTkssTms/*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*Signin*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  pkg("cug-xly", "\u4E2D\u56FD\u5730\u8D28\u5927\u5B66", "\u590F\u4EE4\u8425", "jingzhi", ["epo.cug.edu.cn"], ["*/Open/ZsTkssXly/*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*Signin*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  // 北京林业大学（other，其他系统）
  pkg("bjfu-tm", "\u5317\u4EAC\u6797\u4E1A\u5927\u5B66", "\u63A8\u514D", "other", ["yzbm.bjfu.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  // 沈阳药科大学（other）
  pkg("syphu-ybm", "\u6C88\u9633\u836F\u79D1\u5927\u5B66", "\u63A8\u514D", "other", ["yjs.syphu.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  // 北京协和医学院（other）
  pkg("pumc-tm", "\u5317\u4EAC\u534F\u548C\u533B\u5B66\u9662", "\u63A8\u514D", "other", ["yzbtm.pumc.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*login*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  // 中央财经大学（other）
  pkg("cufe-yzgl", "\u4E2D\u592E\u8D22\u7ECF\u5927\u5B66", "\u63A8\u514D", "other", ["yzgl.cufe.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  // 东北师范大学（other）
  pkg("nenu-ybm", "\u4E1C\u5317\u5E08\u8303\u5927\u5B66", "\u63A8\u514D", "other", ["yz.nenu.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "plugin", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" })),
  // 厦门大学夏令营分支
  pkg("xmu-dxsxly", "\u53A6\u95E8\u5927\u5B66", "\u590F\u4EE4\u8425", "other", ["dxsxly.xmu.edu.cn"], ["*"], [{ ...page("form", "\u62A5\u540D\u5DE5\u4F5C\u533A", "form", ["*"]), fields: commonSchoolMajorDateFields() }], { mode: "session", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS }, exp({ sessionCrawl: "experimental" }))
];
function buildBlueSchoolAdapterPackages() {
  const BLUE_SCHOOL_MAJOR_FIELDS = [
    {
      profilePath: "education.university",
      labels: ["\u6BD5\u4E1A\u9662\u6821", "\u672C\u79D1\u6BD5\u4E1A\u9662\u6821", "\u6BD5\u4E1A\u5B66\u6821", "\u672C\u79D1\u5B66\u6821"],
      selectors: ['input[id*="bydwm" i]', 'input[id*="bkbydwShow" i]', 'input[name*="bydwm" i]'],
      driver: "school-picker",
      codeSelectors: ['input[id*="bydwm" i]', 'input[name*="bydwm" i]'],
      nameSelectors: ['input[id*="bydw" i]', 'input[id*="bkbydwShow" i]', 'input[name*="bydw" i]'],
      displaySelectors: ['input[id*="bkbydwShow" i]', 'input[name*="bkbydwShow" i]'],
      codeNamespace: "moe.school",
      picker: {
        protocol: "blue-flat",
        triggerSelectors: ['span.addon[onclick*="chooseSch"]', 'span.addon[onclick*="chooseYx"]', 'a[onclick*="chooseSch"]', 'a[onclick*="chooseYx"]'],
        frameNames: ["chooseSch", "chooseYx", "SelUniversity", "universitySelectPage", "SchoolPage"],
        frameSrcPatterns: ["*chooseSch*", "*chooseYx*", "*SelUniversity*", "*universitySelectPage*", "*school*", "*university*"],
        searchInputSelectors: ['input[type="text"]', "input.search", 'input[name="key"]', "#key"],
        queryButtonSelectors: ["button", "a", 'input[type="button"]', 'input[value="\u67E5\u8BE2"]', 'input[value="\u641C\u7D22"]'],
        resultRowSelectors: ["table tr", "li.result", "tr.trbg"],
        chooseSelectors: ['input[type="image"]', "a", 'input[type="button"]', "span[onclick]", "td[onclick]", "tr[onclick]"]
      }
    },
    {
      profilePath: "education.major",
      labels: ["\u6BD5\u4E1A\u4E13\u4E1A", "\u672C\u79D1\u4E13\u4E1A", "\u6240\u5B66\u4E13\u4E1A", "\u4E13\u4E1A\u540D\u79F0"],
      selectors: ['input[id*="byzydm" i]', 'input[id*="byzymc" i]', 'input[name*="byzydm" i]', 'input[name*="byzymc" i]'],
      driver: "major-picker",
      codeSelectors: ['input[id*="byzydm" i]', 'input[name*="byzydm" i]'],
      nameSelectors: ['input[id*="byzymc" i]', 'input[id*="byzy" i]', 'input[name*="byzymc" i]'],
      displaySelectors: ['input[id*="bkbyzyShow" i]', 'input[name*="bkbyzyShow" i]'],
      codeNamespace: "moe.major",
      picker: {
        protocol: "blue-flat",
        triggerSelectors: ['span.addon[onclick*="chooseZy"]', 'span.addon[onclick*="chooseZydm"]', 'a[onclick*="chooseZy"]'],
        frameNames: ["chooseZy", "chooseZydm", "SelMajor", "SelSubject", "SelBkdzZydm", "majorSelectPage", "MajorPage"],
        frameSrcPatterns: ["*chooseZy*", "*chooseZydm*", "*SelMajor*", "*SelSubject*", "*SelBkdzZydm*", "*majorSelectPage*", "*major*", "*specialty*"],
        searchInputSelectors: ['input[type="text"]', "input.search", 'input[name="key"]', "#key"],
        queryButtonSelectors: ["button", "a", 'input[type="button"]', 'input[value="\u67E5\u8BE2"]', 'input[value="\u641C\u7D22"]'],
        resultRowSelectors: ["table tr", "li.result", "tr.trbg"],
        chooseSelectors: ['input[type="image"]', "a", 'input[type="button"]', "span[onclick]", "td[onclick]", "tr[onclick]"]
      }
    },
    { profilePath: "basic.birthday", labels: ["\u51FA\u751F\u65E5\u671F", "\u51FA\u751F\u5E74\u6708"], selectors: ['input[id*="csrq" i]', 'input[id*="txtcsrq" i]'], driver: "date", datePrecision: "day" },
    { profilePath: "education.startDate", labels: ["\u5165\u5B66\u5E74\u6708", "\u672C\u79D1\u5165\u5B66\u5E74\u6708"], selectors: ['input[id*="rxny" i]', 'input[id*="txtrxny" i]'], driver: "month-picker", datePrecision: "month" },
    { profilePath: "education.endDate", labels: ["\u6BD5\u4E1A\u5E74\u6708", "\u9884\u8BA1\u6BD5\u4E1A\u5E74\u6708"], selectors: ['input[id*="byny" i]', 'input[id*="bkbyny" i]', 'input[id*="txtbkbyny" i]'], driver: "month-picker", datePrecision: "month" }
  ];
  const entries = [
    ["blue-seu", "\u4E1C\u5357\u5927\u5B66", "gsas.seu.edu.cn"],
    ["blue-fudan", "\u590D\u65E6\u5927\u5B66", "gsas.fudan.edu.cn"],
    ["blue-cags", "\u4E2D\u56FD\u5730\u8D28\u79D1\u5B66\u9662", "gsas.cags.ac.cn"],
    ["blue-ustc", "\u4E2D\u56FD\u79D1\u5B66\u6280\u672F\u5927\u5B66", "xspt.ustc.edu.cn"],
    ["blue-bit", "\u5317\u4EAC\u7406\u5DE5\u5927\u5B66", "yz.bit.edu.cn"],
    ["blue-tongji", "\u540C\u6D4E\u5927\u5B66", "yzbm.tongji.edu.cn"],
    ["blue-xjtu", "\u897F\u5B89\u4EA4\u901A\u5927\u5B66", "yzbm.xjtu.edu.cn"],
    ["blue-uestc", "\u7535\u5B50\u79D1\u6280\u5927\u5B66", "yzbm.uestc.edu.cn"],
    ["blue-cupl", "\u4E2D\u56FD\u653F\u6CD5\u5927\u5B66", "yzbm.cupl.edu.cn"],
    ["blue-cpu", "\u4E2D\u56FD\u836F\u79D1\u5927\u5B66", "yzs.cpu.edu.cn"],
    ["blue-cup", "\u4E2D\u56FD\u77F3\u6CB9\u5927\u5B66", "gmss.cup.edu.cn"],
    ["blue-cau", "\u4E2D\u56FD\u519C\u4E1A\u5927\u5B66", "yzk.cau.edu.cn"],
    ["blue-buct", "\u5317\u4EAC\u5316\u5DE5\u5927\u5B66", "yzbm.buct.edu.cn"],
    ["blue-hfut", "\u5408\u80A5\u5DE5\u4E1A\u5927\u5B66", "yzbm.hfut.edu.cn"],
    ["blue-sustech", "\u5357\u65B9\u79D1\u6280\u5927\u5B66", "yzbm.sustech.edu.cn"]
  ];
  return entries.map(
    ([id, schoolName, host]) => pkg(
      id,
      schoolName,
      "\u901A\u7528\u62A5\u540D",
      "blue",
      [host],
      ["*/logon*", "*/apply*", "*/edit*"],
      [{ ...page("form", "\u62A5\u540D\u4FE1\u606F", "form", ["*"]), fields: BLUE_SCHOOL_MAJOR_FIELDS }],
      { mode: "guided", pageOrder: ["form"], blockPathPatterns: FORM_SHELL_BLOCKS },
      exp({ sessionCrawl: "experimental" })
    )
  );
}
function validateAdapterPackage(raw) {
  if (!raw || typeof raw !== "object") throw new Error("\u9002\u914D\u5305\u4E0D\u662F\u5BF9\u8C61");
  const p = raw;
  if (p.schemaVersion !== 1 || !p.id || !p.version || !p.schoolName || !p.match?.hosts?.length) throw new Error("\u9002\u914D\u5305\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5");
  if (!Array.isArray(p.pages) || !p.pages.every((x) => x.id && x.name && Array.isArray(x.pathPatterns) && ["form", "crawl-only", "shell", "upload", "print", "result"].includes(x.role))) throw new Error("\u9875\u9762\u5951\u7EA6\u683C\u5F0F\u9519\u8BEF");
  if (new Set(p.pages.map((x) => x.id)).size !== p.pages.length) throw new Error("\u9875\u9762\u5951\u7EA6 ID \u91CD\u590D");
  const driverIds = /* @__PURE__ */ new Set(["text", "radio", "native-select", "date", "month-picker", "date-range", "textarea", "table", "layui", "ant", "select2", "element", "kendo", "aspnet", "school-picker", "major-picker"]);
  const stringList = (value) => value === void 0 || Array.isArray(value) && value.every((item) => typeof item === "string");
  if (p.pages.some((x) => x.fields?.some((field) => !driverIds.has(field.driver) || !field.profilePath && !field.extensionKey))) throw new Error("\u5B57\u6BB5\u5951\u7EA6\u683C\u5F0F\u9519\u8BEF");
  if (p.pages.some((x) => x.fields?.some(
    (field) => !stringList(field.labels) || !stringList(field.selectors) || !stringList(field.codeSelectors) || !stringList(field.nameSelectors) || !stringList(field.displaySelectors) || !stringList(field.dateModelSelectors) || !stringList(field.datePanelSelectors) || !stringList(field.picker?.triggerSelectors) || !stringList(field.picker?.frameNames) || !stringList(field.picker?.frameSrcPatterns) || !stringList(field.picker?.searchInputSelectors) || !stringList(field.picker?.queryButtonSelectors) || !stringList(field.picker?.resultRowSelectors) || !stringList(field.picker?.chooseSelectors) || !stringList(field.picker?.categorySelectSelectors)
  ))) throw new Error("\u5B57\u6BB5\u5951\u7EA6\u9009\u62E9\u5668\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4");
  if (p.pages.some((x) => !stringList(x.nextSelectors) || !stringList(x.validationErrorSelectors))) throw new Error("\u9875\u9762\u5BFC\u822A\u5951\u7EA6\u9009\u62E9\u5668\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4");
  if (p.pages.some((x) => x.fields?.some((field) => field.picker?.protocol && !["minimal", "blue-flat"].includes(field.picker.protocol)))) throw new Error("\u5B57\u6BB5\u5951\u7EA6\u5F39\u7A97\u534F\u8BAE\u65E0\u6548");
  const dateFormats = /* @__PURE__ */ new Set(["yyyy", "yyyyMM", "yyyy-MM", "yyyy/MM", "yyyy\u5E74MM\u6708", "yyyyMMdd", "yyyy-MM-dd", "yyyy/MM/dd", "yyyy\u5E74MM\u6708dd\u65E5"]);
  if (p.pages.some((x) => x.fields?.some((field) => field.dateFormat && !dateFormats.has(field.dateFormat)))) throw new Error("\u5B57\u6BB5\u5951\u7EA6\u65E5\u671F\u683C\u5F0F\u65E0\u6548");
  if (!p.crawl || !Array.isArray(p.crawl.pageOrder)) throw new Error("\u722C\u53D6\u5951\u7EA6\u683C\u5F0F\u9519\u8BEF");
  if (p.crawl.pageOrder.some((id) => !p.pages.some((pageItem) => pageItem.id === id))) throw new Error("\u722C\u53D6\u6B65\u9AA4\u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u9875\u9762\u5951\u7EA6");
  if (p.crawl.readOnlyPaths?.some((path) => typeof path !== "string" || !path.startsWith("/") || /:\/\/|\.\./.test(path))) throw new Error("\u4F1A\u8BDD\u722C\u53D6\u767D\u540D\u5355\u5FC5\u987B\u662F\u540C\u6E90\u7EDD\u5BF9\u8DEF\u5F84");
  if (!["never", "manual-save-only", "validated-next-only"].includes(p.commitPolicy)) throw new Error("\u63D0\u4EA4\u7B56\u7565\u683C\u5F0F\u9519\u8BEF");
  if (!p.capabilities || Object.values(p.capabilities).some((status) => !["directory", "experimental", "verified", "drifted"].includes(status))) throw new Error("\u80FD\u529B\u72B6\u6001\u683C\u5F0F\u9519\u8BEF");
  const rejectExecutable = (value, seen = /* @__PURE__ */ new Set()) => {
    if (typeof value === "function") throw new Error("\u8FDC\u7A0B\u9002\u914D\u5305\u4E0D\u5F97\u5305\u542B\u53EF\u6267\u884C\u51FD\u6570");
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) rejectExecutable(child, seen);
  };
  rejectExecutable(p);
  return p;
}
function matchAdapterPackage(url, packages = SCHOOL_ADAPTER_PACKAGES) {
  const matches = packages.filter((p) => declarativeMatchUrl(p.match, url));
  if (!matches.length) return void 0;
  const score = (p) => {
    const hosts = p.match?.hosts || [];
    let s = 0;
    for (const h of hosts) {
      if (h === "*") s -= 100;
      else if (h.startsWith("*.")) s += 5;
      else s += 20;
    }
    const paths = p.match?.pathPatterns || [];
    s += paths.length;
    return s;
  };
  return matches.sort((a, b) => score(b) - score(a))[0];
}

// src/core/schools.ts
var SCHOOLS = [{ "name": "\u4E09\u5CE1\u5927\u5B66", "host": "yzbm.ctgu.edu.cn", "entry": "https://yzbm.ctgu.edu.cn/logon" }, { "name": "\u4E0A\u6D77\u4EA4\u901A\u5927\u5B66", "host": "ga.sjtu.edu.cn", "entry": "https://ga.sjtu.edu.cn/" }, { "name": "\u4E0A\u6D77\u4EA4\u901A\u5927\u5B66", "host": "ga.sjtu.edu.cn", "entry": "https://ga.sjtu.edu.cn/zsgl/ytmgl/login.aspx", "adapter": "sjtu-tmsgl" }, { "name": "\u4E0A\u6D77\u4EA4\u901A\u5927\u5B66", "host": "ga.sjtu.edu.cn", "entry": "https://ga.sjtu.edu.cn/zsgl/xlygl/login.aspx", "adapter": "sjtu-xlygl" }, { "name": "\u4E0A\u6D77\u5916\u56FD\u8BED\u5927\u5B66", "host": "yzmis.shisu.edu.cn", "entry": "https://yzmis.shisu.edu.cn/#/homeIndex" }, { "name": "\u4E0A\u6D77\u6D77\u4E8B\u5927\u5B66", "host": "zhaosheng.eol.cn", "entry": "https://zhaosheng.eol.cn/10254/user/login/login" }, { "name": "\u4E0A\u6D77\u8D22\u7ECF\u5927\u5B66", "host": "yz.sufe.edu.cn", "entry": "https://yz.sufe.edu.cn/ks/logon" }, { "name": "\u4E0A\u6D77\u97F3\u4E50\u5B66\u9662", "host": "yjszs.shcmusic.edu.cn", "entry": "https://yjszs.shcmusic.edu.cn/#/homeIndex" }, { "name": "\u4E1C\u5317\u5927\u5B66", "host": "yjszs.neu.edu.cn", "entry": "https://yjszs.neu.edu.cn/yjszs/plugins/zs/zsxsd/entrance#/entrance" }, { "name": "\u4E1C\u534E\u5927\u5B66", "host": "yzbm.dhu.edu.cn", "entry": "https://yzbm.dhu.edu.cn/logon", "adapter": "dhu" }, { "name": "\u4E1C\u5357\u5927\u5B66", "host": "gsas.seu.edu.cn", "entry": "https://gsas.seu.edu.cn/logon", "adapter": "blue-seu" }, { "name": "\u4E2D\u5357\u5927\u5B66", "host": "yjszsgl.csu.edu.cn", "entry": "https://yjszsgl.csu.edu.cn/zsglxly/tmsgl/login.aspx" }, { "name": "\u4E2D\u5357\u5927\u5B66", "host": "yjszsgl.csu.edu.cn", "entry": "https://yjszsgl.csu.edu.cn/zsgl2026/tmsgl/login.aspx", "adapter": "csu-tmsgl" }, { "name": "\u4E2D\u5357\u8D22\u7ECF\u653F\u6CD5\u5927\u5B66", "host": "zncjzf.form.360eol.com", "entry": "http://zncjzf.form.360eol.com/" }, { "name": "\u4E2D\u56FD\u4EBA\u6C11\u5927\u5B66", "host": "yjsfs.ruc.edu.cn", "entry": "https://yjsfs.ruc.edu.cn/tp/zs/login/toLogin/tm" }, { "name": "\u4E2D\u56FD\u519C\u4E1A\u5927\u5B66", "host": "yzk.cau.edu.cn", "entry": "https://yzk.cau.edu.cn/logon", "adapter": "blue-cau" }, { "name": "\u4E2D\u56FD\u5730\u8D28\u5927\u5B66", "host": "epo.cug.edu.cn", "entry": "https://epo.cug.edu.cn/" }, { "name": "\u4E2D\u56FD\u5730\u8D28\u79D1\u5B66\u9662", "host": "gsas.cags.ac.cn", "entry": "https://gsas.cags.ac.cn/logon", "adapter": "blue-cags" }, { "name": "\u4E2D\u56FD\u653F\u6CD5\u5927\u5B66", "host": "yzbm.cupl.edu.cn", "entry": "https://yzbm.cupl.edu.cn/logon", "adapter": "blue-cupl" }, { "name": "\u4E2D\u56FD\u6D77\u6D0B\u5927\u5B66", "host": "stuouc.molstone.cn", "entry": "https://stuouc.molstone.cn/#/login" }, { "name": "\u4E2D\u56FD\u77F3\u6CB9\u5927\u5B66", "host": "gmss.cup.edu.cn", "entry": "https://gmss.cup.edu.cn/logon", "adapter": "blue-cup" }, { "name": "\u4E2D\u56FD\u79D1\u5B66\u6280\u672F\u5927\u5B66", "host": "xspt.ustc.edu.cn", "entry": "https://xspt.ustc.edu.cn/logon", "adapter": "blue-ustc" }, { "name": "\u4E2D\u56FD\u79D1\u5B66\u9662\u5927\u5B66", "host": "zxsq.ucas.ac.cn", "entry": "https://zxsq.ucas.ac.cn/login/index/sc" }, { "name": "\u4E2D\u56FD\u836F\u79D1\u5927\u5B66", "host": "yzs.cpu.edu.cn", "entry": "https://yzs.cpu.edu.cn/logon", "adapter": "blue-cpu" }, { "name": "\u4E2D\u592E\u6C11\u65CF\u5927\u5B66", "host": "yjszs.muc.edu.cn", "entry": "https://yjszs.muc.edu.cn/" }, { "name": "\u5170\u5DDE\u5927\u5B66", "host": "yjszs.lzu.edu.cn", "entry": "https://yjszs.lzu.edu.cn/lzuyjsytms/wlogin.html" }, { "name": "\u5317\u4EAC\u5316\u5DE5\u5927\u5B66", "host": "yzbm.buct.edu.cn", "entry": "https://yzbm.buct.edu.cn/logon", "adapter": "blue-buct" }, { "name": "\u5317\u4EAC\u5916\u56FD\u8BED\u5927\u5B66", "host": "yjszs.bfsu.edu.cn", "entry": "https://yjszs.bfsu.edu.cn/#/homeIndex" }, { "name": "\u5317\u4EAC\u5DE5\u4E1A\u5927\u5B66", "host": "webrecdoc.bjut.edu.cn", "entry": "https://webrecdoc.bjut.edu.cn/zsgl/xlygl/login.aspx" }, { "name": "\u5317\u4EAC\u5DE5\u4E1A\u5927\u5B66", "host": "webrecdoc.bjut.edu.cn", "entry": "https://webrecdoc.bjut.edu.cn/zsgl/tmsgl/login.aspx", "adapter": "bjut-tmsgl" }, { "name": "\u5317\u4EAC\u7406\u5DE5\u5927\u5B66", "host": "yz.bit.edu.cn", "entry": "https://yz.bit.edu.cn/yzbm/logon", "adapter": "blue-bit" }, { "name": "\u5317\u4EAC\u79D1\u6280\u5927\u5B66", "host": "yjsy.ustb.edu.cn", "entry": "https://yjsy.ustb.edu.cn/ksxt/logon" }, { "name": "\u5317\u4EAC\u8BED\u8A00\u5927\u5B66", "host": "yanzhao.blcu.edu.cn", "entry": "https://yanzhao.blcu.edu.cn/student/ytmlogin" }, { "name": "\u5317\u4EAC\u90AE\u7535\u5927\u5B66", "host": "yzfs.bupt.edu.cn", "entry": "https://yzfs.bupt.edu.cn/MasterTm/Signin.aspx", "adapter": "bupt" }, { "name": "\u534E\u4E1C\u5E08\u8303\u5927\u5B66", "host": "yjszs-ks.ecnu.edu.cn", "entry": "https://yjszs-ks.ecnu.edu.cn/logon" }, { "name": "\u534E\u4E1C\u7406\u5DE5\u5927\u5B66", "host": "yz.ecust.edu.cn", "entry": "https://yz.ecust.edu.cn/Login.aspx?ptdm=847BDDEB402986A9" }, { "name": "\u534E\u4E2D\u79D1\u6280\u5927\u5B66", "host": "yanzhao.hust.edu.cn", "entry": "https://yanzhao.hust.edu.cn/" }, { "name": "\u534E\u5357\u7406\u5DE5\u5927\u5B66", "host": "yanzhao.scut.edu.cn", "entry": "https://yanzhao.scut.edu.cn/Open/ZsTkssXly/Signin.aspx" }, { "name": "\u5357\u4EAC\u4E2D\u533B\u836F\u5927\u5B66", "host": "yzbm.njucm.edu.cn", "entry": "https://yzbm.njucm.edu.cn/logon" }, { "name": "\u5357\u4EAC\u533B\u79D1\u5927\u5B66", "host": "yzks.njmu.edu.cn", "entry": "http://yzks.njmu.edu.cn:8080/logon" }, { "name": "\u5357\u4EAC\u5927\u5B66", "host": "gs.nju.edu.cn", "entry": "https://gs.nju.edu.cn/geapp/sys/yjsbmxsd/tmybm/user/login.do" }, { "name": "\u5357\u4EAC\u5E08\u8303\u5927\u5B66", "host": "yz.njnu.edu.cn", "entry": "https://yz.njnu.edu.cn/xly/#/login" }, { "name": "\u5357\u4EAC\u6797\u4E1A\u5927\u5B66", "host": "yzbm.njfu.edu.cn", "entry": "https://yzbm.njfu.edu.cn/logon" }, { "name": "\u5357\u4EAC\u7406\u5DE5\u5927\u5B66", "host": "202.119.85.163", "entry": "http://202.119.85.163/Open/RecruitTkssTmYbm/signin.aspx", "adapter": "njust" }, { "name": "\u5357\u4EAC\u822A\u7A7A\u822A\u5929\u5927\u5B66", "host": "yzsbm.nuaa.edu.cn", "entry": "https://yzsbm.nuaa.edu.cn/logon" }, { "name": "\u5357\u4EAC\u90AE\u7535\u5927\u5B66", "host": "yzbm.njupt.edu.cn", "entry": "http://yzbm.njupt.edu.cn/logon" }, { "name": "\u5357\u5F00\u5927\u5B66", "host": "yzxt.nankai.edu.cn", "entry": "https://yzxt.nankai.edu.cn/intern/frontend/web/user-action/login" }, { "name": "\u5357\u65B9\u533B\u79D1\u5927\u5B66", "host": "yjszs.smu.edu.cn", "entry": "https://yjszs.smu.edu.cn/MasterX/Signin.aspx" }, { "name": "\u6C5F\u82CF\u5927\u5B66", "host": "yjszsgl.ujs.edu.cn", "entry": "https://yjszsgl.ujs.edu.cn/zsgl/tmsgl/login.aspx", "adapter": "ujs-tmsgl" }, { "name": "\u5357\u65B9\u79D1\u6280\u5927\u5B66", "host": "yzbm.sustech.edu.cn", "entry": "https://yzbm.sustech.edu.cn/logon", "adapter": "blue-sustech" }, { "name": "\u5357\u4EAC\u519C\u4E1A\u5927\u5B66", "host": "yzglxt.njau.edu.cn", "entry": "https://yzglxt.njau.edu.cn/gts/Tmsgl/login.aspx", "adapter": "njau-tmsgl" }, { "name": "\u5357\u660C\u5927\u5B66", "host": "gsas.ncu.edu.cn", "entry": "https://gsas.ncu.edu.cn/logon" }, { "name": "\u534E\u5317\u7535\u529B\u5927\u5B66", "host": "yjszs.ncepu.edu.cn", "entry": "https://yjszs.ncepu.edu.cn/zsgl/tmsgl/login.aspx", "adapter": "ncepu-tmsgl" }, { "name": "\u53A6\u95E8\u5927\u5B66", "host": "ssyjsbm.xmu.edu.cn", "entry": "https://ssyjsbm.xmu.edu.cn/" }, { "name": "\u5408\u80A5\u5DE5\u4E1A\u5927\u5B66", "host": "yzbm.hfut.edu.cn", "entry": "https://yzbm.hfut.edu.cn/logon", "adapter": "blue-hfut" }, { "name": "\u5409\u6797\u5927\u5B66", "host": "yzbbm.jlu.edu.cn", "entry": "https://yzbbm.jlu.edu.cn/" }, { "name": "\u540C\u6D4E\u5927\u5B66", "host": "yzbm.tongji.edu.cn", "entry": "https://yzbm.tongji.edu.cn/logon", "adapter": "blue-tongji" }, { "name": "\u54C8\u5C14\u6EE8\u5DE5\u4E1A\u5927\u5B66", "host": "hityzb.hit.edu.cn", "entry": "http://hityzb.hit.edu.cn/zhxy-yjs-zs_v2/common/login?redirectUrl=/pc/tms/index" }, { "name": "\u56DB\u5DDD\u5916\u56FD\u8BED\u5927\u5B66", "host": "yz.sisu.edu.cn", "entry": "https://yz.sisu.edu.cn/#/homeIndex" }, { "name": "\u56DB\u5DDD\u5927\u5B66", "host": "yz.scu.edu.cn", "entry": "https://yz.scu.edu.cn/xly/login/" }, { "name": "\u56FD\u9632\u79D1\u6280\u5927\u5B66", "host": "yjszsxt.nudt.edu.cn", "entry": "https://yjszsxt.nudt.edu.cn/login" }, { "name": "\u590D\u65E6\u5927\u5B66", "host": "gsas.fudan.edu.cn", "entry": "https://gsas.fudan.edu.cn/logon", "adapter": "blue-fudan" }, { "name": "\u5927\u8FDE\u7406\u5DE5\u5927\u5B66", "host": "yjszs.dlut.edu.cn", "entry": "https://yjszs.dlut.edu.cn/zsbm/logon" }, { "name": "\u5929\u6D25\u5927\u5B66", "host": "sszs.tju.edu.cn", "entry": "https://sszs.tju.edu.cn/10056/user/login/login" }, { "name": "\u5C71\u4E1C\u5927\u5B66", "host": "sduyjs.sdu.edu.cn", "entry": "https://sduyjs.sdu.edu.cn/yjszs/plugins/zs/zsxsd/entrance#/entrance" }, { "name": "\u5C71\u4E1C\u7B2C\u4E00\u533B\u79D1\u5927\u5B66", "host": "yjszs.sdfmu.edu.cn", "entry": "https://yjszs.sdfmu.edu.cn/ybm" }, { "name": "\u5E7F\u4E1C\u5DE5\u4E1A\u5927\u5B66", "host": "ehall.gdut.edu.cn", "entry": "https://ehall.gdut.edu.cn/gsapp/sys/yjsbmxsd/entrance.do" }, { "name": "\u5E7F\u897F\u5927\u5B66", "host": "yjsglxt.gxu.edu.cn", "entry": "https://yjsglxt.gxu.edu.cn/ZSXT/Login.aspx?ptdm=847BDDEB402986A9" }, { "name": "\u6606\u660E\u533B\u79D1\u5927\u5B66", "host": "yjsgl.kmmu.edu.cn", "entry": "http://yjsgl.kmmu.edu.cn/ASPX/Student/StuLogin.aspx" }, { "name": "\u6B66\u6C49\u5927\u5B66", "host": "ehall.whu.edu.cn", "entry": "https://ehall.whu.edu.cn/gsapp/sys/wdyjsbm/entrance.do" }, { "name": "\u6C5F\u82CF\u79D1\u6280\u5927\u5B66", "host": "gsas.just.edu.cn", "entry": "https://gsas.just.edu.cn/logon" }, { "name": "\u6CB3\u5357\u5DE5\u4E1A\u5927\u5B66", "host": "yzstu.haut.edu.cn", "entry": "https://yzstu.haut.edu.cn/logon" }, { "name": "\u6C5F\u5357\u5927\u5B66", "host": "yzgmis.jiangnan.edu.cn", "entry": "https://yzgmis.jiangnan.edu.cn/zsgl/tmsgl/register.aspx", "adapter": "jiangnan-tmsgl" }, { "name": "\u6CB3\u6D77\u5927\u5B66", "host": "yzss.hhu.edu.cn", "entry": "https://yzss.hhu.edu.cn/ssxly/index" }, { "name": "\u6D59\u6C5F\u5927\u5B66", "host": "yjsy.zju.edu.cn", "entry": "https://yjsy.zju.edu.cn/zs/user/login" }, { "name": "\u6E05\u534E\u5927\u5B66", "host": "yzbm.tsinghua.edu.cn", "entry": "https://yzbm.tsinghua.edu.cn/ndLogin" }, { "name": "\u6E29\u5DDE\u533B\u79D1\u5927\u5B66", "host": "yjszs.wmu.edu.cn", "entry": "https://yjszs.wmu.edu.cn/yzbm/logon" }, { "name": "\u6E56\u5357\u5927\u5B66", "host": "yjszsxt.hnu.edu.cn", "entry": "https://yjszsxt.hnu.edu.cn/zsxt2026/tmsgl/login.aspx", "adapter": "hnu-tmsgl" }, { "name": "\u6E56\u5357\u5927\u5B66", "host": "yjszsxt.hnu.edu.cn", "entry": "https://yjszsxt.hnu.edu.cn/zsxt/tmsgl/login.aspx", "adapter": "hnu-tmsgl" }, { "name": "\u6E56\u5357\u4E2D\u533B\u836F\u5927\u5B66", "host": "yjsxt.hnucm.edu.cn", "entry": "https://yjsxt.hnucm.edu.cn/zsgl/tmsgl/login.aspx", "adapter": "hnucm-tmsgl" }, { "name": "\u6E56\u5357\u519C\u4E1A\u5927\u5B66", "host": "yzbm.hunau.edu.cn", "entry": "https://yzbm.hunau.edu.cn/logon" }, { "name": "\u6E58\u6F6D\u5927\u5B66", "host": "yzbm.xtu.edu.cn", "entry": "https://yzbm.xtu.edu.cn/logon" }, { "name": "\u70DF\u53F0\u5927\u5B66", "host": "gsas.ytu.edu.cn", "entry": "http://gsas.ytu.edu.cn/logon" }, { "name": "\u7535\u5B50\u79D1\u6280\u5927\u5B66", "host": "yzbm.uestc.edu.cn", "entry": "https://yzbm.uestc.edu.cn/logon", "adapter": "blue-uestc" }, { "name": "\u82CF\u5DDE\u5927\u5B66", "host": "gsas.yjs.suda.edu.cn", "entry": "https://gsas.yjs.suda.edu.cn/logon" }, { "name": "\u897F\u5317\u5E08\u8303\u5927\u5B66", "host": "yzbm.nwnu.edu.cn", "entry": "https://yzbm.nwnu.edu.cn/logon" }, { "name": "\u897F\u5357\u8D22\u7ECF\u5927\u5B66", "host": "yjsbm.swufe.edu.cn", "entry": "https://yjsbm.swufe.edu.cn/Stu/StuLog/index" }, { "name": "\u897F\u5B89\u4EA4\u901A\u5927\u5B66", "host": "yzbm.xjtu.edu.cn", "entry": "https://yzbm.xjtu.edu.cn/logon", "adapter": "blue-xjtu" }, { "name": "\u897F\u5B89\u7535\u5B50\u79D1\u6280\u5927\u5B66", "host": "yjspt.xidian.edu.cn", "entry": "https://yjspt.xidian.edu.cn/gsapp/sys/wdyjsbm/entrance.do" }, { "name": "\u91CD\u5E86\u5927\u5B66", "host": "syk.cqu.edu.cn", "entry": "https://syk.cqu.edu.cn/index.php" }, { "name": "\u957F\u5B89\u5927\u5B66", "host": "yzfw.chd.edu.cn", "entry": "https://yzfw.chd.edu.cn:9091/xly/login/" }, { "name": "\u9752\u6D77\u5927\u5B66", "host": "yzbm.qhu.edu.cn", "entry": "https://yzbm.qhu.edu.cn/logon" }, { "name": "\u4E2D\u5C71\u5927\u5B66", "host": "enroll.sysu.edu.cn", "entry": "https://enroll.sysu.edu.cn/yjszs/plugins/zs/zsxsd/entrance", "adapter": "sysu-enroll" }, { "name": "\u4E2D\u592E\u8D22\u7ECF\u5927\u5B66", "host": "yzgl.cufe.edu.cn", "entry": "https://yzgl.cufe.edu.cn/cufeXs/index", "adapter": "cufe-yzgl" }, { "name": "\u4E2D\u56FD\u77FF\u4E1A\u5927\u5B66", "host": "yzs.cumt.edu.cn", "entry": "https://yzs.cumt.edu.cn/yzbm/logon", "adapter": "blue-cumt" }, { "name": "\u5317\u4EAC\u6797\u4E1A\u5927\u5B66", "host": "yzbm.bjfu.edu.cn", "entry": "https://yzbm.bjfu.edu.cn/", "adapter": "bjfu-tm" }, { "name": "\u5317\u4EAC\u534F\u548C\u533B\u5B66\u9662", "host": "yzbtm.pumc.edu.cn", "entry": "https://yzbtm.pumc.edu.cn/user/login/login", "adapter": "pumc-tm" }, { "name": "\u4E1C\u5317\u5E08\u8303\u5927\u5B66", "host": "yz.nenu.edu.cn", "entry": "https://yz.nenu.edu.cn/ybm", "adapter": "nenu-ybm" }, { "name": "\u897F\u5317\u519C\u6797\u79D1\u6280\u5927\u5B66", "host": "yjszs.nwafu.edu.cn", "entry": "https://yjszs.nwafu.edu.cn/yjszs/plugins/zs/zsxsd/entrance", "adapter": "nwafu-yjszs" }, { "name": "\u897F\u5317\u519C\u6797\u79D1\u6280\u5927\u5B66", "host": "yjszs.nwsuaf.edu.cn", "entry": "https://yjszs.nwsuaf.edu.cn/yjszs/plugins/zs/zsxsd/entrance", "adapter": "nwafu-yjszs" }, { "name": "\u6C88\u9633\u836F\u79D1\u5927\u5B66", "host": "yjs.syphu.edu.cn", "entry": "https://yjs.syphu.edu.cn/pas/ybm", "adapter": "syphu-ybm" }, { "name": "\u4E2D\u56FD\u5730\u8D28\u5927\u5B66", "host": "epo.cug.edu.cn", "entry": "https://epo.cug.edu.cn/Open/ZsTkssTms/Signin.aspx", "adapter": "cug-tms" }, { "name": "\u4E2D\u56FD\u5730\u8D28\u5927\u5B66", "host": "epo.cug.edu.cn", "entry": "https://epo.cug.edu.cn/Open/ZsTkssXly/Signin.aspx", "adapter": "cug-xly" }, { "name": "\u5E7F\u4E1C\u5DE5\u4E1A\u5927\u5B66", "host": "yjsxt.gdut.edu.cn", "entry": "https://yjsxt.gdut.edu.cn/gsapp/sys/yjsbmxsd/entrance.do", "adapter": "gdut-gsapp" }, { "name": "\u6D77\u5357\u5927\u5B66", "host": "ehall.hainanu.edu.cn", "entry": "https://ehall.hainanu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do", "adapter": "hainanu-gsapp" }, { "name": "\u66A8\u5357\u5927\u5B66", "host": "yjsxt.jnu.edu.cn", "entry": "https://yjsxt.jnu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do", "adapter": "jnu-gsapp" }, { "name": "\u5E7F\u5DDE\u5927\u5B66", "host": "yjsyxt.gzhu.edu.cn", "entry": "https://yjsyxt.gzhu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do", "adapter": "gzhu-gsapp" }, { "name": "\u6B66\u6C49\u5927\u5B66", "host": "yz.whu.edu.cn", "entry": "https://yz.whu.edu.cn/", "adapter": "whu-gsapp" }, { "name": "\u4E2D\u56FD\u79D1\u5B66\u9662\u5927\u5B66", "host": "zhaosheng.ucas.ac.cn", "entry": "https://zhaosheng.ucas.ac.cn/sign_up/TMS/views/index.aspx", "adapter": "ucas-tms" }, { "name": "\u6E56\u5357\u5E08\u8303\u5927\u5B66", "host": "yjsyzsxt.hunnu.edu.cn", "entry": "https://yjsyzsxt.hunnu.edu.cn/zsxt2025/tmsgl/login.aspx", "adapter": "hunnu-tmsgl" }, { "name": "\u53A6\u95E8\u5927\u5B66", "host": "dxsxly.xmu.edu.cn", "entry": "https://dxsxly.xmu.edu.cn/accounts", "adapter": "xmu-dxsxly" }, { "name": "\u9C81\u4E1C\u5927\u5B66", "host": "yzbm.ldu.edu.cn", "entry": "https://yzbm.ldu.edu.cn/logon" }];

// src/core/retro-honor-fill.ts
function findRetroHonorSlots(doc2) {
  const slots2 = [];
  for (let i = 0; i < 5; i++) {
    const nameEl = doc2.querySelector(`input[id="txthjmc${i}"], input[name="txthjmc${i}"]`);
    const timeEl = doc2.querySelector(`input[id="txthjsj${i}"], input[name="txthjsj${i}"]`);
    const rankEl = doc2.querySelector(`input[id="txtpm${i}"], input[name="txtpm${i}"]`);
    if (nameEl || timeEl || rankEl) {
      slots2.push({ name: nameEl, time: timeEl, rank: rankEl, index: i });
    }
  }
  return slots2;
}

// test/real-e2e.mts
var import_jsdom = require("jsdom");
var allPass = true;
function check(label, ok, detail) {
  if (ok) console.log("  \u2705", label);
  else {
    console.error("  \u274C", label, detail || "");
    allPass = false;
  }
}
var total = SCHOOL_ADAPTER_PACKAGES.length;
console.log(`
\u30101\u3011\u5171 ${total} \u4E2A\u9002\u914D\u5305\uFF0C\u5168\u90E8 validateAdapterPackage`);
var vfail = 0;
for (const p of SCHOOL_ADAPTER_PACKAGES) {
  try {
    validateAdapterPackage(p);
  } catch (e) {
    vfail++;
    console.error("  \u274C", p.id, e.message);
  }
}
check(`\u5168\u90E8 ${total} \u4E2A\u9002\u914D\u5305\u6821\u9A8C\u901A\u8FC7`, vfail === 0, `\u5931\u8D25${vfail}\u4E2A`);
console.log("\n\u30102\u3011matchAdapterPackage \u771F\u5B9E URL \u547D\u4E2D\uFF0843 \u4E2A\u771F\u5B9E\u5B66\u6821\u5165\u53E3\uFF09");
var urlTests = [
  // 蓝色专属
  { url: "https://gsas.fudan.edu.cn/logon", expectId: "blue-fudan" },
  { url: "https://yzbm.tongji.edu.cn/logon", expectId: "blue-tongji" },
  { url: "https://yz.bit.edu.cn/yzbm/logon", expectId: "blue-bit" },
  { url: "https://gsas.seu.edu.cn/logon", expectId: "blue-seu" },
  { url: "https://yzbm.uestc.edu.cn/logon", expectId: "blue-uestc" },
  { url: "https://yzbm.cupl.edu.cn/logon", expectId: "blue-cupl" },
  { url: "https://xspt.ustc.edu.cn/logon", expectId: "blue-ustc" },
  { url: "https://gmss.cup.edu.cn/logon", expectId: "blue-cup" },
  { url: "https://yzk.cau.edu.cn/logon", expectId: "blue-cau" },
  { url: "https://yzbm.buct.edu.cn/logon", expectId: "blue-buct" },
  { url: "https://yzbm.hfut.edu.cn/logon", expectId: "blue-hfut" },
  { url: "https://yzbm.sustech.edu.cn/logon", expectId: "blue-sustech" },
  // 蓝色兜底
  { url: "https://yzbm.tsinghua.edu.cn/logon", expectId: "platform-blue" },
  { url: "https://yjszs-ks.ecnu.edu.cn/logon", expectId: "platform-blue" },
  { url: "https://yjszs.dlut.edu.cn/zsbm/logon", expectId: "platform-blue" },
  // retro
  { url: "https://yjszsgl.csu.edu.cn/zsgl2026/tmsgl/login.aspx", expectId: "retro-tmsgl-csu" },
  { url: "https://yjszsxt.hnu.edu.cn/zsxt2026/tmsgl/login.aspx", expectId: "retro-tmsgl-hnu" },
  { url: "https://yzgmis.jiangnan.edu.cn/zsgl/tmsgl/register.aspx", expectId: "retro-tmsgl-jiangnan" },
  { url: "https://yzglxt.njau.edu.cn/gts/Tmsgl/login.aspx", expectId: "retro-tmsgl-njau" },
  { url: "https://yjszs.ncepu.edu.cn/zsgl/tmsgl/login.aspx", expectId: "retro-tmsgl-ncepu" },
  { url: "https://yjszsgl.ujs.edu.cn/zsgl/tmsgl/login.aspx", expectId: "retro-tmsgl-ujs" },
  { url: "https://yjsxt.hnucm.edu.cn/zsgl/tmsgl/login.aspx", expectId: "retro-tmsgl-hnucm" },
  { url: "https://ga.sjtu.edu.cn/zsgl/ytmgl/login.aspx", expectId: "retro-tmsgl-sjtu" },
  { url: "https://webrecdoc.bjut.edu.cn/zsgl/tmsgl/login.aspx", expectId: "retro-tmsgl-bjut" },
  // cover / jingzhi 专项
  { url: "https://enroll.sysu.edu.cn/yjszs/plugins/zs/zsxsd/entrance", expectId: "sysu-enroll" },
  { url: "https://yjszs.nwafu.edu.cn/yjszs/plugins/zs/zsxsd/entrance", expectId: "nwafu-yjszs" },
  { url: "https://yjszs.nwsuaf.edu.cn/yjszs/plugins/zs/zsxsd/entrance", expectId: "nwafu-yjszs" },
  { url: "https://yjsxt.gdut.edu.cn/gsapp/sys/yjsbmxsd/entrance.do", expectId: "gdut-gsapp" },
  { url: "https://ehall.hainanu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do", expectId: "hainanu-gsapp" },
  { url: "https://yjsxt.jnu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do", expectId: "jnu-gsapp" },
  { url: "https://yjsyxt.gzhu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do", expectId: "gzhu-gsapp" },
  { url: "https://yz.whu.edu.cn/", expectId: "whu-gsapp" },
  { url: "https://zhaosheng.ucas.ac.cn/sign_up/TMS/views/index.aspx", expectId: "ucas-tms" },
  { url: "https://yjsyzsxt.hunnu.edu.cn/zsxt2025/tmsgl/login.aspx", expectId: "hunnu-tmsgl" },
  { url: "https://dxsxly.xmu.edu.cn/accounts", expectId: "xmu-dxsxly" },
  { url: "https://epo.cug.edu.cn/Open/ZsTkssTms/Signin.aspx", expectId: "cug-tms" },
  { url: "https://epo.cug.edu.cn/Open/ZsTkssXly/Signin.aspx", expectId: "cug-xly" },
  { url: "https://yzbm.bjfu.edu.cn/", expectId: "bjfu-tm" },
  { url: "https://yzbtm.pumc.edu.cn/user/login/login", expectId: "pumc-tm" },
  { url: "https://yz.nenu.edu.cn/ybm", expectId: "nenu-ybm" },
  { url: "https://yjs.syphu.edu.cn/pas/ybm", expectId: "syphu-ybm" },
  { url: "https://yzgl.cufe.edu.cn/cufeXs/index", expectId: "cufe-yzgl" },
  { url: "https://yzs.cumt.edu.cn/yzbm/logon", expectId: "blue-cumt" }
];
var pp = 0;
var pf = 0;
for (const t of urlTests) {
  const matched = matchAdapterPackage(t.url, SCHOOL_ADAPTER_PACKAGES);
  const ok = matched && matched.id === t.expectId;
  if (ok) pp++;
  else {
    pf++;
    console.error(`    \u274C [${t.expectId}] ${t.url} \u2192 ${matched?.id || "(\u672A\u547D\u4E2D)"}`);
  }
}
check(`URL \u547D\u4E2D: ${pp}\u901A\u8FC7 / ${pf}\u5931\u8D25\uFF08\u5171${urlTests.length}\u4E2A\uFF09`, pf === 0);
console.log("\n\u30103\u3011schools.ts \u2192 adapter \u94FE\u8DEF\uFF08\u5173\u952E 18 \u6761\uFF09");
var criticalEntries = [
  { host: "enroll.sysu.edu.cn", adapter: "sysu-enroll" },
  { host: "yjszs.nwafu.edu.cn", adapter: "nwafu-yjszs" },
  { host: "epo.cug.edu.cn", adapter: "cug-tms" },
  { host: "epo.cug.edu.cn", adapter: "cug-xly" },
  { host: "yjsxt.gdut.edu.cn", adapter: "gdut-gsapp" },
  { host: "ehall.hainanu.edu.cn", adapter: "hainanu-gsapp" },
  { host: "yjsxt.jnu.edu.cn", adapter: "jnu-gsapp" },
  { host: "yjsyxt.gzhu.edu.cn", adapter: "gzhu-gsapp" },
  { host: "yz.whu.edu.cn", adapter: "whu-gsapp" },
  { host: "zhaosheng.ucas.ac.cn", adapter: "ucas-tms" },
  { host: "yjsyzsxt.hunnu.edu.cn", adapter: "hunnu-tmsgl" },
  { host: "dxsxly.xmu.edu.cn", adapter: "xmu-dxsxly" },
  { host: "yzbm.bjfu.edu.cn", adapter: "bjfu-tm" },
  { host: "yzbtm.pumc.edu.cn", adapter: "pumc-tm" },
  { host: "yz.nenu.edu.cn", adapter: "nenu-ybm" },
  { host: "yjs.syphu.edu.cn", adapter: "syphu-ybm" },
  { host: "yzgl.cufe.edu.cn", adapter: "cufe-yzgl" },
  { host: "yzs.cumt.edu.cn", adapter: "blue-cumt" }
];
var sp = 0;
var sf = 0;
for (const e of criticalEntries) {
  const found = SCHOOLS.find((s) => s.host === e.host && s.adapter === e.adapter);
  if (found) sp++;
  else {
    sf++;
    console.error(`    \u274C schools\u7F3A: ${e.host} \u2192 ${e.adapter}`);
  }
}
check(`schools.ts \u94FE\u8DEF: ${sp}\u901A\u8FC7 / ${sf}\u5931\u8D25`, sf === 0);
console.log("\n\u30104\u3011findRetroHonorSlots \u5728\u771F\u5B9E jsdom DOM \u4E0A\u8BC6\u522B\u69FD\u4F4D");
var retroHtml = `<!doctype html><html><body>
<table><tr>
  <td><input id="txthjmc0" value=""/></td>
  <td><input id="txthjsj0" value=""/></td>
  <td><input id="txtpm0" value=""/></td>
</tr><tr>
  <td><input id="txthjmc1" value=""/></td>
  <td><input id="txthjsj1" value=""/></td>
  <td><input id="txtpm1" value=""/></td>
</tr><tr>
  <td><input id="txthjmc2" value=""/></td>
  <td><input id="txthjsj2" value=""/></td>
  <td><input id="txtpm2" value=""/></td>
</tr></table>
</body></html>`;
var dom = new import_jsdom.JSDOM(retroHtml);
var doc = dom.window.document;
var slots = findRetroHonorSlots(doc);
check(`\u8BC6\u522B\u5230 3 \u4E2A\u5956\u52B1\u69FD (id=txthjmc0/1/2)`, slots.length === 3, `\u627E\u5230${slots.length}\u4E2A`);
var emptyDom = new import_jsdom.JSDOM(`<!doctype html><body><p>no slots</p></body></html>`);
var emptySlots = findRetroHonorSlots(emptyDom.window.document);
check("\u7A7A\u9875\u9762\u8BC6\u522B\u4E3A 0 \u4E2A\u69FD", emptySlots.length === 0);
console.log("\n\u30105\u3011\u65B0\u589E 18 \u4E2A\u4E13\u9879\u9002\u914D\u5305\u7ED3\u6784\u5B8C\u6574\u6027");
var newIds = [
  "sysu-enroll",
  "nwafu-yjszs",
  "hunnu-tmsgl",
  "gdut-gsapp",
  "hainanu-gsapp",
  "jnu-gsapp",
  "gzhu-gsapp",
  "whu-gsapp",
  "blue-cumt",
  "cug-tms",
  "cug-xly",
  "bjfu-tm",
  "syphu-ybm",
  "pumc-tm",
  "cufe-yzgl",
  "nenu-ybm",
  "xmu-dxsxly",
  "ucas-tms"
];
var np = 0;
var nf = 0;
for (const id of newIds) {
  const found = SCHOOL_ADAPTER_PACKAGES.find((p) => p.id === id);
  if (!found) {
    nf++;
    console.error(`    \u274C \u7F3A\u5931: ${id}`);
    continue;
  }
  const hasMatch = !!found.match?.hosts?.length;
  const hasFields = !!found.pages?.some((p) => p.fields?.length);
  if (hasMatch && hasFields) np++;
  else {
    nf++;
    console.error(`    \u274C [${id}] match=${hasMatch} fields=${hasFields}`);
  }
}
check(`\u65B0\u589E ${newIds.length} \u9002\u914D\u5305: ${np}\u901A\u8FC7 / ${nf}\u5931\u8D25`, nf === 0);
console.log("\n\u30106\u3011\u84DD\u8272 15 \u6240\u5B66\u6821\u9002\u914D\u5305\u5B58\u5728");
var blueIds = ["blue-seu", "blue-fudan", "blue-cags", "blue-ustc", "blue-bit", "blue-tongji", "blue-xjtu", "blue-uestc", "blue-cupl", "blue-cpu", "blue-cup", "blue-cau", "blue-buct", "blue-hfut", "blue-sustech"];
var bp = 0;
var bf = 0;
for (const id of blueIds) {
  if (SCHOOL_ADAPTER_PACKAGES.find((p) => p.id === id)) bp++;
  else {
    bf++;
    console.error(`    \u274C \u7F3A\u5931: ${id}`);
  }
}
check(`\u84DD\u8272 ${blueIds.length}: ${bp}\u901A\u8FC7 / ${bf}\u5931\u8D25`, bf === 0);
console.log("\n\u30107\u3011Retro 9 \u6240\u5B66\u6821\u9002\u914D\u5305\u5B58\u5728 + family=jingzhi");
var retroIds = ["retro-tmsgl-csu", "retro-tmsgl-hnu", "retro-tmsgl-jiangnan", "retro-tmsgl-njau", "retro-tmsgl-ncepu", "retro-tmsgl-ujs", "retro-tmsgl-hnucm", "retro-tmsgl-sjtu", "retro-tmsgl-bjut"];
var rp = 0;
var rf = 0;
for (const id of retroIds) {
  const p = SCHOOL_ADAPTER_PACKAGES.find((p2) => p2.id === id);
  if (p) {
    rp++;
    if (p.family !== "jingzhi") {
      console.error(`    \u274C [${id}] family=${p.family}`);
      rf++;
    }
  } else {
    rf++;
    console.error(`    \u274C \u7F3A\u5931: ${id}`);
  }
}
check(`Retro ${retroIds.length}: ${rp}\u901A\u8FC7 / ${rf}\u5931\u8D25`, rf === 0);
console.log("\n" + "=".repeat(60));
if (allPass) {
  console.log("\u2705\u2705\u2705 \u771F\u5B9E E2E \u5168\u90E8\u901A\u8FC7\uFF01");
  process.exit(0);
} else {
  console.error("\u274C\u274C\u274C \u6709\u5931\u8D25\u9879");
  process.exit(1);
}

# 项目情况说明(交接用 · 非执行指令)

> 用途:向接手方(GPT)完整说明 `D:\deepseek-work\tuimian-autofill` 的现状、已完成的改造、遗留问题与技术卡点。
> 性质:**情况说明**,不是任务书,不要求按此改动代码。接手方自行判断如何推进。

---

## 一、项目是什么

**tuimian-autofill(预推免填表助手)** —— 辅助填写高校推免/预推免/夏令营报名系统的浏览器扩展。

- 技术栈:TypeScript + esbuild + Manifest V3(Edge/Chrome),jsdom 单测 + Playwright 真实扩展 E2E。
- 定位:档案只存本机 `chrome.storage.local`,登录/验证码全人工,工具只填"登录后的填表页",**绝不点保存/下一步/提交**。
- 规模:源码约 1.6 万行(不含本轮新增),核心在 `src/core/`(matcher 识别 / filler 填充 / adapter-packages 学校适配包 / control-drivers 契约驱动 / dynamic-table 动态表 / picker 系列弹窗驱动)。
- 当前版本 v2.0.5,HEAD `97d78d3`。

## 二、本轮改造的来龙去脉

这个仓库经历了一轮**多 AI 交替审查-整改**:

1. 竞品对标:与「巨能填系统 1.8.9」(Qt+Python+Node+MV3 混合架构)做过完整对比,结论记录在 `docs/analysis/project-and-competitor-2026-09-09.md`。
2. **v3 计划**(P00–P12):我实现了 FillTask 类型、只读候选解析、冲突保护、稳定回读、恢复等,但被审查否定——理由是"helper 通过 ≠ 生产链路通过"(存在双写入、误报成功、验收漏报)。
3. **v4 计划**(F00–F10):修复了观测器假阴性、候选消歧接入、已有值语义、React/Vue 夹具等,再次被审查否定——理由是"合同链与通用链未共享目标语义、恢复夹具不能证明恢复、证据校验可绕过"。
4. **v5 计划**(G00–G09):当前轮。以"把审查反例变成硬断言"为方法,逐个关闭 V01–V07,并补齐生产链路。审查依据在 `docs/analysis/DS-v4完成情况复审-2026-09-09.md`。

**当前结论:G00–G06、G07b、G08、G09 = passed;V01–V07 全部关闭;唯一未完成卡是 G07a(见第四节)。**

## 三、本轮对生产代码的实际改动(未提交)

### 新增的生产模块

| 文件 | 作用 |
|---|---|
| `src/core/fill-pipeline.ts` | **整链编排唯一入口** `runFillPipeline`(合同→认领→通用→合并)。content 与测试共用它,终结"只改 helper 不改整链"的问题 |
| `src/core/fill-merge.ts` | 合同结果与通用结果按元素同一性合并;歧义候选节点进入禁止写集合;无 el 的合同失败保留为逻辑目标结果 |
| `src/core/fill-session.ts` | 文档实例身份(WeakMap)、runId/文档代际/档案修订、`captureRunSnapshot`/`isRunStillActive`(原轮快照守卫) |
| `src/core/fill-task.ts` | Outcome/IssueScope/FillWriteItem/FillRunScope 类型;`routeKeyFor`(origin + 不透明摘要,不落盘 pathname/query/hash);`toPlainFillItem` DTO 白名单 |
| `src/core/task-compiler.ts` | 只读控件候选解析(nativeId 唯一/重复 id 歧义/selector 有序回退/radio 成组) |
| `src/core/task-executor.ts` | `stableReadback`、`attributableValidationError`(无关联不回退)、`findNewAttributableError`(多选择器)、`stableVerifyWritten` |
| `src/core/value-semantics.ts` | 空值/占位/身份证 X/邮箱/前导零/日期精度比较 |
| `src/core/dependency.ts` | 最小 dependsOn 有向无环调度(拓扑序/环检测/缺引用/子树阻塞) |
| `src/background/aggregation.ts` | 跨 frame 参与者终态协议(注册/结果/终态/超时汇总) |

### 修改的关键生产文件

- `src/core/filler.ts`:所有权改为 `writeRecords`(before/expected/after/driver/userIntervened);`markEl` 只做 UI 不再授予所有权;`clearPageFill` 以记录为准;`conditionalRestore` 严格条件(需 ownership + 可逆文本 + 值等于写入后快照);`radioGroupOf` 按 form 限定;`readNativeControlValue`(原型 getter,绕过 React/Vue value tracker);写入后真实 DOM 回读。
- `src/core/control-drivers.ts`:`resolveContractControl` 严格解析(歧义返回候选节点);`guardExistingScalar` 按**控件类型**而非 driver 名判定;所有非成功分支 `markBlocked` 阻塞依赖者;写入前 `captureBeforeValue`、写入后 `registerWriteOwnership`。
- `src/content/index.ts`:所有异步函数显式接收原轮 ctx;用户干预监听(`noteExternalInput`);settle 复验收口;FILL_REGISTER/FILL_TERMINAL 上报;picker 角色优先判定;删除"看着不像数字就清空"的无证据自愈。
- `src/background/index.ts`:参与者注册/终态协议;DTO 接收端白名单 `sanitizeItems`;deadline 只报超时。
- `src/core/adapter-packages.ts`:LZU 契约补 `validationErrorSelectors`、`education.startDate` 声明 `dependsOn: ['education.university']`。
- 其他:`matcher.ts`(导师/推荐人等负词)、`fill-telemetry.ts`(终态分区定义)、`save-guard.ts`(证据带时间/路由/30 分钟有效期、按钮文字不算已填)、`standard-code-catalog.ts`(不再删括号)。

### 测试与证据

- 新增测试套件(接入 `npm test`):`v5-audit.test.ts`(V01–V07 + G 卡验收,13 项反例硬断言)、`control-drivers.test.ts`、`fill-session.test.ts`、`task-executor.test.ts`、`aggregation.test.ts`、`dependency.test.ts`、`value-semantics.test.ts`、`fill-merge.test.ts`、`task-compiler.test.ts`、`filler-essay.test.ts`、`picker-state-machine.test.ts`。
- 浏览器夹具:`test/fixtures/{react-controlled,vue-controlled,recover-semantics}.html`(React 18.3.1 / Vue 3.5.13,本地 vendor,非 CDN);`test/regression/run-e2e.ts` 增加 LZU 形状合同夹具(清空/关联错误恢复/依赖阻塞)。
- 样本与证据:`test/samples/ustb-education/page.html` + `test/evidence/pilot-ustb-education.json`(真实内置包试点,含 configHash 与样本哈希);`test/evidence/pilot-2026-09.json`(generic 行为夹具)。
- 新增测试依赖:`react`/`react-dom` 18.3.1、`vue` 3.5.13(devDependencies,固定版本)。

## 四、遗留问题:我(DeepSeek)没能解决的

### 唯一的未完成卡:G07a(in_progress)

任务书要求:"**新建本地省→市→区或学校→专业的异步浏览器夹具,父选择后延迟替换子控件;生产执行器等待真实变化并选对值**",并明确"仅 jsdom 同步字段顺序不满足本卡"。

**我卡住的技术原因**:

1. **e2e 无法注入测试适配包**。`test/regression/run-e2e.ts` 加载的是 `dist/` 里的**真实扩展**,而适配包硬编码在 `src/core/adapter-packages.ts` 中(生产数据)。要造"父选择后延迟替换子控件"的场景,需要一个声明了级联依赖的测试契约;往生产包里加测试契约会污染生产数据,而现有测试基建没有"测试态注入包"的通道。
2. **现有生产契约里没有可用的级联场景**。LZU 的 `education.startDate` 已声明依赖 `education.university`,但院校是弹窗选择器(school-picker),其"成功"需要弹窗交互,无法在 e2e 里构造"父延迟成功"的正例;北科/合工大的院校与专业是**两个独立弹窗**(我尝试给专业加 `dependsOn: ['education.university']`,结果破坏了既有测试——专业被错误阻塞,已回退)。
3. 因此我目前只有替代证据:契约级 V04 全状态阻塞(档案空/冲突/失败/等待 picker/组件等待)、父同值放行单测、LZU 浏览器级"父失败→子不写"(`rxnf` 为空)。

**另外两项未做的断言**(同一卡):
- 浏览器级"父延迟成功后才写子";
- "取消/替换停止"在依赖场景的断言。

### 可能的解决方向(供参考,未实施)

- 给测试基建加"测试态适配包注入"(例如 `run-e2e.ts` 通过 URL 参数或构建期开关加载一个测试包),代价是改动测试架构。
- 或在 `src/core/adapter-packages.ts` 增加一个**明确标记为测试用途**的包(需要评估是否可接受生产代码携带测试数据)。
- 或改用 jsdom 模拟"控件延迟出现 + 轮询等待"——但任务书明确说这不够。

## 五、其他保留项(非缺陷,已如实记录)

- **liveVerified=false**:全程未访问真实高校认证站点、未读 Cookie、未用真实账号。所有"真实页面"结论都来自本地夹具。
- **CI 未实跑**:`.github/workflows/offline-gates.yml` 已编写(含 typecheck/test/check:adapters/regression/浏览器 E2E,用 Playwright 自带 Chromium),但**从未在真实 CI 运行过**。
- **未提交、未 push**:48+ 个文件的改动全部停留在工作区。
- 工作区还有未跟踪的 `.deploy-xiaaaaa-v203/`、`docs/analysis/`、`nul`,按纪律未清理。

## 六、接手前必须知道的红线(项目级约束)

- 保持**完整一键填充**、picker 人工接管、14 行动态表;不得为了通过负例把功能改成"整页不填"。
- **不新增**自动保存、自动下一步、自动提交、自动上传;不自动填密码/验证码。
- 不访问真实高校账号/站点、不读浏览器 Cookie、不运行 `test:e2e:real`。
- 不修改竞品目录、不删用户未跟踪文件、不自动提交或 push。
- 强制项未满足不得标 passed,不得移到"需要另行授权"的 backlog。

## 七、验证方式(当前基线:全部退出 0)

```powershell
npm run typecheck
npm test
npm run check:adapters
npm run test:regression
$env:PW_HEADLESS = '1'
npm run test:e2e
npm run test:regression:e2e
git diff --check
```

负向自检(预期非零,用于证明检测真实生效):
- `TUIMIAN_NEGATIVE_SELFCHECK=1 npm run test:regression` → 1
- 临时把 `conditionalRestore` 改成恒 `notAttempted` → `run-e2e` → 1(验证后已还原)
- `check:adapters` 六项证据篡改(缺 file/hash、错版本、不完整清单、offlinePassed=false、虚构包)→ 各 1

## 八、文档地图

| 文件 | 内容 |
|---|---|
| `docs/analysis/DeepSeek-V4-Flash-整改PLAN-v5.md` | 当前任务书(G00–G09) |
| `docs/analysis/DS-v4完成情况复审-2026-09-09.md` | 本轮要关闭的审查反例(V01–V07 等) |
| `docs/dev-notes/implementation-progress-v5.md` | **逐卡账本**:状态、改动、命令退出码、Remaining、最终状态报告 |
| `docs/dev-notes/regression-coverage-v5.md` | **覆盖矩阵**:V/G/R/Q 逐条测试名称、生产入口、证明层级、源码哈希 |
| `docs/dev-notes/implementation-progress-v4.md`、`regression-coverage-v4.md` | 上一轮记录(历史,结论已被否定,仅供追溯) |
| `docs/analysis/project-and-competitor-2026-09-09.md` | 与竞品的完整对比 |

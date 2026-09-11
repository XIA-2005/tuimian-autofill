# 给下一个 DeepSeek 的接手提示词(复制全文)

你接手 `D:\deepseek-work\tuimian-autofill` 的**预推免填表助手**项目。这是浏览器扩展(Manifest V3 + TypeScript + esbuild),档案只存本机,登录/验证码全人工,只填"登录后的填表页",**绝不点保存/下一步/提交**。

本项目的改造采用**多 AI 交叉审查**模式:上一个 DeepSeek 实施 → GPT 审查并完善 → 你接手核实与收尾。**不要把任何一方写下的"完成"当作事实**,一切以你实跑命令和读代码为准。

---

## 一、先读这些(按顺序)

1. `docs/analysis/DeepSeek-V4-Flash-整改PLAN-v5.md` —— 当前任务书(G00–G09 的要求与验收)
2. `docs/dev-notes/implementation-progress-v5.md` —— 逐卡账本(状态、改动、命令退出码、Remaining、最终报告)
3. `docs/dev-notes/regression-coverage-v5.md` —— 覆盖矩阵(V01–V07 / G 卡 / R / Q 逐条对应测试与源码哈希)
4. `docs/analysis/DS-v4完成情况复审-2026-09-09.md` —— 本轮要关闭的审查反例
5. `docs/analysis/ds-v5-review-2026-09-09/` —— GPT 审查上一轮成果的证据(日志 + `dependency-browser-evidence.json`)
6. 当前 `git status` / `git diff` —— **51 个文件改动,全部未提交**

## 二、当前状态(2026-09-10 00:20 实测)

**上一个 DeepSeek 完成的部分(v5 主线)**

- passed:G00、G01、G02、G03、G04、G05、G06、G07b、G08、G09
- V01–V07 审查反例全部关闭(硬断言在 `src/core/v5-audit.test.ts`,接入 `npm test`)
- 关键生产改动:`src/core/fill-pipeline.ts`(整链唯一入口)、`fill-merge.ts`、`fill-session.ts`、`fill-task.ts`、`task-compiler.ts`、`task-executor.ts`、`value-semantics.ts`、`dependency.ts`、`src/background/aggregation.ts`;`filler.ts` 的 writeRecords 所有权与严格 `conditionalRestore`;`control-drivers.ts` 的严格控件解析与按控件类型判定

**GPT 审查后完善的部分(针对唯一未完成卡 G07a)**

- 新增 `src/core/dependency-executor.ts`:`fillAdapterContractAsync` —— 异步合同依赖执行器(拓扑序、等待控件就绪、原轮取消、超时)
- 新增契约字段 `AdapterFieldContract.dependencyWait`(`readySelector`/`timeoutMs`/`settleMs`),在 `adapters.ts` 与 `adapter-packages.ts` 中声明
- `src/core/fill-pipeline.ts` 新增 `runFillPipelineAsync` 并**接入生产**(content 全部改为 await 调用)
- 新增 `test/dependency-e2e.mjs`:浏览器级级联夹具,7 场景全过(normal / same / conflict / empty / timeout / cancel / replace-parent),并含 `--negative-sync` 负向模式
- 新增 `src/core/dependency-executor.test.ts`(接入 `test/run.ts`)

**我(写这份提示词的 DeepSeek)刚刚实跑的门禁基线,全部退出 0**:

```
npm run typecheck            0
npm test                     0
npm run check:adapters       0
npm run test:regression      0   (HARD 58 / FAIL 0)
PW_HEADLESS=1 npm run test:e2e            0
PW_HEADLESS=1 npm run test:regression:e2e 0
node test/dependency-e2e.mjs 0   (7 个 PASS)
git diff --check             0
```

## 三、你要做的事

1. **先自己跑一遍上面 8 条命令**,确认基线。任何一条非 0,先定位再谈其他。
2. **独立审查 GPT 的完善是否真正满足 G07a 的验收**,不要只看它自带测试通过:
   - 任务书 G07a 原文要求:"新建本地省→市→区或学校→专业的异步浏览器夹具,父选择后延迟替换子控件;生产执行器等待真实变化并选对值""父延迟成功后才写子""取消/替换停止""环不写"。
   - 逐条对照 `test/dependency-e2e.mjs` 与 `src/core/dependency-executor.ts`,判断是否真的覆盖;特别检查:负向模式是否真能证明"禁用同步机制时测试会失败";`dependencyWait` 是否被真实生产包使用;异步路径是否引入了新的竞态或"取消后仍写"。
   - 如发现缺口,补测试或补实现,并把结论写进账本。
3. **更新 `docs/dev-notes/implementation-progress-v5.md` 与 `regression-coverage-v5.md`**:把 G07a 的真实状态(由你判定)写清楚,列出新增测试名称、生产入口、证明层级、命令退出码与源码哈希。
4. **如实报告**:如果 G07a 现在满足,写"整改完成";如果仍有缺口,标题写"整改未完成"并指出具体卡与缺失证据。**不得为了让结论好看而改弱断言或把红项移到 backlog。**

## 四、必须遵守的红线

- 保持**完整一键填充**、picker 人工接管、14 行动态表;不得为通过负例改成"整页不填"。
- **不新增**自动保存、自动下一步、自动提交、自动上传;不自动填密码/验证码。
- 不访问真实高校账号/站点、不读 Cookie、不运行 `test:e2e:real`;`liveVerified` 保持 `false`。
- 不修改竞品目录、不删用户未跟踪文件(`.deploy-xiaaaaa-v203/`、`docs/analysis/`、`nul`)、不自动提交或 push。
- 连续执行,不逐卡询问;强制项未满足不得标 passed。
- 每张卡的结论必须附**实跑命令的退出码**;未运行的命令明确写"未运行"。

## 五、已知保留项(交接时就存在,不要当成新问题)

- `liveVerified=false`:全程未访问真实高校认证站点、未读 Cookie、未用真实账号,所有"真实页面"结论来自本地夹具。
- `.github/workflows/offline-gates.yml` 已编写但**从未在真实 CI 运行**。
- 51 个文件的改动**未提交、未 push**。
- 环境:Node v24.15.0 / npm 11.12.1;新增测试依赖 react/react-dom 18.3.1、vue 3.5.13(本地 vendor,非 CDN)。

## 六、文档地图

| 文件 | 内容 |
|---|---|
| `docs/analysis/DeepSeek-V4-Flash-整改PLAN-v5.md` | 任务书(G00–G09) |
| `docs/analysis/DS-v4完成情况复审-2026-09-09.md` | 本轮要关闭的审查反例 |
| `docs/dev-notes/implementation-progress-v5.md` | 逐卡账本(状态/改动/退出码/Remaining/最终报告) |
| `docs/dev-notes/regression-coverage-v5.md` | 覆盖矩阵(V/G/R/Q 逐条测试与源码哈希) |
| `docs/analysis/ds-v5-review-2026-09-09/` | GPT 审查证据(日志 + 依赖夹具行为数据) |
| `docs/analysis/项目情况说明-交接GPT.md` | 更详细的项目背景与生产改动清单 |
| `docs/analysis/project-and-competitor-2026-09-09.md` | 与竞品「巨能填 1.8.9」的完整对比 |

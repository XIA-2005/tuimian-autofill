# 续接提示词(复制到新对话)

继续 `D:\deepseek-work\tuimian-autofill` 的 **PLAN v5 整改**。

## 一、先读取(按顺序,不要跳过)

1. `docs/analysis/DeepSeek-V4-Flash-整改PLAN-v5.md` —— 任务书(G00–G09 全部要求与验收)
2. `docs/dev-notes/implementation-progress-v5.md` —— 账本:逐卡状态、改动、命令退出码、Remaining,末尾有"v5 最终状态"报告
3. `docs/dev-notes/regression-coverage-v5.md` —— 覆盖矩阵:V01–V07 / G 卡 / R / Q 逐条对应测试、生产入口、证明层级、源码哈希
4. `docs/analysis/DS-v4完成情况复审-2026-09-09.md` —— 审查依据(本轮整改要关闭的反例)
5. 当前 `git status` 与 `git diff` —— 全部改动**未提交**,分布在 48+ 个文件

## 二、当前状态(截至 2026-09-09 23:20,以账本为准)

- **passed**:G00、G01、G02、G03、G04、G05、G06、G07b、G08、G09
- **in_progress(唯一未完成卡)**:**G07a**
- V01–V07 审查反例**全部关闭**;最终门禁 7 条命令全部退出 0。

### G07a 未满足的三项强制验收

1. 本地"父选择后延迟替换子控件"的**异步浏览器夹具**未建
   - 约束:e2e 只加载**生产**适配包,不能注入测试契约;需要先解决夹具基建(例如允许测试态注入受控包,或构造生产包可覆盖的延迟场景)。
2. 浏览器级"**父延迟成功后才写子**"未单独断言。
3. "**取消/替换停止**"在依赖场景未断言。

已有替代证据(不要重复劳动):契约级 V04 全状态阻塞(档案空/冲突/失败/等待 picker/组件等待)、父同值放行单测、LZU 浏览器级父失败断言(`rxnf` 不写入)。

## 三、下一步

**只补齐 G07a 的上述三项**,不要重做任何已 passed 的卡,不要重构 fillAll/异步链。

## 四、工作纪律(违反即返工)

- 连续执行,不逐卡询问;**强制项未满足不得标 passed**,不得移到需要另行授权的 backlog。
- 保持完整一键填充、picker 人工接管、14 行动态表;**不新增**自动保存/下一步/提交/上传。
- 不访问真实高校账号/站点、不读 Cookie、不运行 `test:e2e:real`;`liveVerified` 保持 false。
- 不修改竞品、不删未跟踪文件、不自动提交或 push。
- 每个新断言必须接入最终门禁;负向自检(观测器注入 / 恢复变异禁用 / 证据六项篡改)预期**非零退出**。
- 每卡完成后更新账本与覆盖矩阵;换对话不得依据上一段 AI 的"完成"文字跳过验证。

## 五、最终门禁(逐条执行并记录退出码)

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

当前基线:以上 7 条均为 0;`npm test` 中 v5-audit 套件全绿(13 项反例已关闭)。

## 六、改动集中位置(便于定位)

- **新增**:`src/core/{fill-pipeline,v5-audit.test,control-drivers.test,fill-session.test,task-executor.test,dependency,dependency.test,value-semantics,value-semantics.test,fill-merge,fill-merge.test,fill-task,task-compiler,task-compiler.test,filler-essay.test,picker-state-machine.test}.ts`、`src/background/{aggregation.ts,aggregation.test.ts}`、`test/check-adapters.ts`、`test/regression/*`、`test/fixtures/*`、`test/samples/*`、`test/evidence/*`
- **修改**:`src/core/{filler,control-drivers,matcher,adapter-packages,fill-telemetry,save-guard,standard-code-catalog}.ts`、`src/content/index.ts`、`src/background/index.ts`、`test/run.ts`、`test/playwright.mjs`、`build.mjs`、`package.json`
- **证据**:`test/evidence/pilot-ustb-education.json`(完整合同试点,含 configHash 与样本哈希)、`test/evidence/pilot-2026-09.json`(generic 行为夹具)

## 七、已知保留项(如实说明,不要掩盖)

- `liveVerified=false`:未访问真实高校认证站点、未读 Cookie、未用真实账号。
- `.github/workflows/offline-gates.yml` 已编写但**未在真实 CI 运行**。
- 未提交、未 push(用户未授权)。

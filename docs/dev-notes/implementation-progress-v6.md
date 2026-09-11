# 实施进度账本 v6(整改 PLAN v6 · H00–H05)

> 2026-09-10后续复审：本文件保留DS历史结论，不代表当前全部完成。Codex已直接修复新增反例并补保存证据/取消路径；当前状态见`codex-v6-handoff-2026-09-10.md`和`../analysis/DS-v6复审与直接修复报告-2026-09-10.md`，剩余任务见PLAN v7。

> 依据:`docs/analysis/DeepSeek-V4-Flash-整改PLAN-v6.md` + `docs/analysis/DS-v5复审与接管结果-2026-09-10.md` + `docs/dev-notes/codex-g07a-handoff-2026-09-10.md`。
> 规则:passed 前检查强制项;强制项未满足只能 in_progress/failed。禁止"强制项未做却写全部 passed"。
> 历史账本 `implementation-progress-v5.md` 与 `regression-coverage-v5.md` 保留为历史,不再作为当前结论。
> 本轮执行者:DeepSeek(接手 DS)。基线快照:HEAD `97d78d3` + 工作区未提交改动。

## 接手前的独立复核(PLAN v5 交接提示词第 1–2 项)

- 8 条门禁独立复跑,全部符合预期:`typecheck 0 / npm test 0 / check:adapters 0 / test:regression 0(HARD 58/0) / test:e2e 0 / test:regression:e2e 0 / node test/dependency-e2e.mjs 0(8 场景) / git diff --check 0`;`node test/dependency-e2e.mjs --negative-sync` → **1**(负向有效,证明"退回同步执行"时依赖场景必失败)。
- G07a 逐条对照 PLAN v5 验收:异步夹具(省→校→专业,260ms/180ms 延迟替换)、父延迟成功后才写子(事件顺序断言)、取消/替换停止(cancel/replace-parent)、环不写(加载期 `validateAdapterPackage` + 运行时 `buildDepOrder` 双拒绝,单测零写入)、V04 空/冲突阻塞、父同值放行——均已覆盖。
- 如实记录:`dependencyWait` 目前只由测试契约声明,真实生产包(LZU)仅声明 `dependsOn` 并走默认 3500ms/100ms;异步入口在 LZU 生产链真实生效。未发现"取消后仍写"。

## Task: H00 — 冻结剩余反例和接管边界

- Status: passed
- Production entry: `runFillPipeline`(同步入口遇依赖页只返回待异步处理,不抢写)、`runFillPipelineAsync`(含依赖页唯一生产入口)、`src/core/v6-audit.test.ts`(接入 `npm test`)。
- Changes:
  - `src/core/v6-audit.test.ts`(新):复审1–7 转硬断言(v6-H01/H02/H03/H05 命名),接入 `test/run.ts`。
  - `fill-pipeline.ts`:同步入口检测到页面合同含 `dependsOn` 时返回 blocked 合同项并认领控件(通用链不得绕过),不再按声明顺序同步写依赖页。
  - `v5-audit.test.ts`:G07a"父同值放行"改走异步入口(`runV5AuditAsyncTests`),同步入口不再执行依赖页。
- 负向自检(实测):把 `existingValueDecision` 的"首项=空"推断恢复 → `npm test` 退出 1 且命中 3 条 v6-H01 断言;撤销后退出 0。
- Checks:`npm run typecheck` 0;`npm test` 0(v6-audit 全绿);`test:regression:e2e` 0。

## Task: H01 — 首项已有值保护与所有回退路径消歧

- Status: passed
- Production entry:`filler.existingValueDecision`(通用链)、`control-drivers.guardExistingScalar`(合同链)、`control-drivers.resolveContractControl`(label/radio 回退)。
- Changes:
  - 删除"无显式 selected 且停在首项=空"的 DOM 推断:真实有效首项进入同值/冲突判定(用户点选首项不写 selected 属性,旧推断会覆盖用户选择)。占位首项(请选择/空值)仍照常填写。
  - `label[for]`:改为收集全部同 id 目标,>1 即歧义(候选进入禁止写集合);标签容器内多控件不再取首。
  - radio 组身份 = name + 所属 form;无 name 的 radio 各自独立,不再折叠成一组。
- Tests:
  - unit:`v6-H01-首项合法值不得被覆盖`、`v6-H01-首项同值零写事件`、`v6-H01-占位首项照常填写`、`v6-H01-合同首项合法值不得被覆盖`、`v6-H01-label重复ID两个均零写`、`v6-H01-同标签多控件不猜`、`v6-H01-radio无name不合成一组`。
  - ext:`test/regression/run-e2e.ts`「H01 首项保护浏览器正负例」(真实扩展:首项保留且零写事件、占位首项填成女)。
  - 既有断言按新语义重述(非削弱):LZU 合同用例拆为"无占位首项保留 + 占位首项成对写入回读"两条。
- Checks:`typecheck` 0;`npm test` 0;`test:regression` 0(HARD 58/0);`test:e2e` 0;`test:regression:e2e` 0。

## Task: H02 — 写入记录绑定原轮、档案修订和输入类型

- Status: passed
- Production entry:`filler.beginWriteScope/endWriteScope/registerWriteOwnership/conditionalRestore`;`fill-pipeline` 两个入口登记本轮作用域;`content` 显式传 ctx。
- Changes:
  - `WriteRecord` 增 `runId/epoch/revision`;写入记录由 `beginWriteScope` 绑定原轮,不再只有 before/expected/after/driver。
  - `conditionalRestore(doc, el, ctx)`:必须显式传原轮 ctx;记录与当前 runId/文档代际/档案修订全部一致才允许恢复;真实 `input.type` 非文本(text/tel/email/url/search 之外,含 date)不按文本恢复。
  - `content.runSettleOnce`/末轮稳定校正/`test/regression` 恢复场景均传原轮 ctx。
- Tests:`v6-H02-旧修订记录不得授权恢复`、`v6-H02-跨轮记录不得授权恢复`、`v6-H02-真实input.type非文本不得恢复`、`v6-H02-合法当前轮文本可恢复`、`v6-H02-写入记录含原轮与修订`;G06 真实恢复浏览器用例保持通过。
- 负向自检(实测):注释掉修订校验 → `npm test` 退出 1(命中 `v6-H02-旧修订记录不得授权恢复`);撤销后退出 0。
- Remaining(如实):组件/表格类写入入口的 ownership 迁移清单未逐一列出(见 H04);`clearPageFill`(用户主动清除)仍按"当前值仍等于写入后快照"判定,不要求同轮(清除是用户显式动作,与"恢复"语义不同)。

## Task: H03 — frame 注册封口、真实终态和文档通信身份

- Status: passed(证明层级见下:帧级为 ext;协议序为 bg 真实 background 入口)
- Production entry:`background/index.ts`(REGISTRATION_WINDOW_MS 封口、deadline 25s、lateRegistrations)、`fill-session.documentIdentity`、`aggregation`(terminalize 不改被拒状态)。
- Changes:
  - `documentIdentity` 改为"每次内容脚本实例随机令牌 + 实例内计数"(不再 `doc1` 重启);同实例仍用 WeakMap 稳定。
  - 参与者注册封口窗口 700ms:FILL 广播后未封口前不得仅凭 `allTerminal` 完成;封口后到达的注册计入 `lateRegistrations` 并在 FILL_DONE 中可见。
  - deadline 15s → 25s,覆盖 content 末轮补填(2.5/7/15s)+ settle 420ms + 稳定验证,避免把仍在工作的轮次误报超时。
- Changes(续):
  - H03.4 终态类别:`FILL_TERMINAL` 增 `terminalKind`(done/waiting-manual/cancelled);content 按 picker 状态显式声明;aggregation 按参与者记录并在汇总输出 `terminalKinds`;新轮替换旧轮时向旧调用方返回 `cancelled`(不再静默悬挂)。
  - H03.3 跨 frame 边界可见:FILL_DONE 携带 `missing`/`lateRegistrations`/`terminalKinds`,面板追加"N 个区域等待人工接管 / 未响应 / 收口后注册"提示。
- Tests:`v6-H03-通信文档身份跨实例不同`、`v6-H03-注册未封口不得提前完成`、`v6-H03-晚注册帧必须计入完成汇总`、`v6-H03-终态类别计数`、`v6-H03-终态类别透传`、`v6-H03-乱序与重复seq被拒绝`、`v6-H03-同帧新旧文档分开计数`、`v6-H03-新轮替换旧轮显式取消`、`v6-H00-被拒终态不得改变完成标志`;ext:`test/regression/run-e2e.ts`「H03 跨 frame 终态协议」(顶层快速完成、子 frame 延迟终态 >1200ms、汇总含两 frame 且不报超时、子 frame 失败字段计入"需人工"、子 frame 延迟出现的选项被补填)。
- 证明层级说明(如实):帧级场景为真实扩展浏览器断言;`旧文档回报`/`乱序 seq`/`重复 seq` 由**真实 background bundle 的消息入口**在 VM 中验证(非 aggregation 纯函数单测)。浏览器内无法伪造帧级乱序消息,而任务书禁止给正式扩展增加测试契约消息接口,故不再造浏览器级版本。

## Task: H04 — 所有异步 driver 的恢复点与稳定条件

- Status: passed(证明层级:行任务/picker 换档案为 ext;人工接管继续为 contract;React/Vue/北科/合工大沿用既有 ext)
- Changes:
  - `attemptPickersInner`:`await pickInPage` 后、`await sleep(800)` 回填等待后各增原轮+节点连接校验,失效即返回不标记 filled。
  - `processRowJobsInner`:网格稳定等待 `await sleep(500)` 后校验原轮;加行 await 之后、写断点/发遥测之前校验原轮。
- 恢复点清单(H04.1,本轮实测):

| 恢复点 | 恢复后第一个副作用 | 原轮校验 |
|---|---|---|
| `fillCurrentDocument` → `runFillPipelineAsync` | 合同写入/通用写入 | 依赖执行器每次 await 后 `stillActive()`;`beginWriteScope` 绑定本轮 |
| `scheduleCascadeRetries` 80ms 定时器 | `attemptPickers` | `if (runStillActive(ctx))` 才调用 |
| `attemptPickersInner` `await pickInPage` | 标记 filled / markPickerDone / 遥测 | 新增:`!runStillActive(ctx) \|\| !el.isConnected` → 直接返回 |
| `attemptPickersInner` `await sleep(800)` | 同上 | 新增:同上 |
| `waitForSkippedPickerRelease`/`resumePickerQueueWhenSafe`/`completeManualPicker`/`handoffPicker` | 恢复队列/人工接管标记 | 入口 `runStillActive(ctx)`;回调链透传 ctx 至 `attemptPickers` |
| `processRowJobsInner` 网格等待 `await sleep(500)` | 加行/写断点 | 新增:每轮 sleep 后 `!runStillActive(ctx) → return` |
| 加行 `await fillXxx` | `writeRowJobs` / 遥测 | 新增:await 后校验原轮 |
| `scheduleSettleChecks` 420ms | `runSettleOnce`(可触发恢复) | `runStillActive(settleRun.ctx)` |
| 补填 2.5/7/15s | 再次填充 | `isRunStillActive(mySnapshot, activeRunSnapshot, …)` |
| 保存后恢复 900/2600/6000ms | 恢复轮填充 | G04 轮次守卫(每轮重新 loadProfile) |

- 已确认既有保护:依赖执行器每次 await 后校验原轮/父目标;`runSettleOnce` 与末轮稳定校正传原轮 ctx;合同 expectedValue 使用 driver 验证过的原生 DOM 表示(不重新字符串错比)。
- 逐 driver 策略表(H04.2):

| driver | 写前权限 | 预期语义/原生表示 | 就绪条件 | 稳定预算 | 回读表示 | 取消方式 | 不可恢复原因 |
|---|---|---|---|---|---|---|---|
| text | `guardExistingScalar` 仅 empty 写 | 档案文本值 | 非 disabled/readonly | settle 420ms + 末轮稳定校正 | `readNativeControlValue` | 原轮失效即停 | 非 text/用户干预/值偏离 |
| native-select | 同上(占位视为空,首项为真实值) | option 代码或名称 | 目标选项真实存在 | 同上 | 选中项文本+值 | 同上 | 同上 |
| radio | 同上(组按 name+form) | 组内代码/名称 | 目标 radio 存在 | 同上 | checked + 标签 | 同上 | 同上 |
| date/month-picker | 同上(按精度语义比较) | 格式化日期串 | 面板/输入框就绪 | 同上 | 严格格式回读 | 同上 | 日期不通用撤销 |
| school/major-picker | 代码冲突按角色判定 | 代码+名称成对 | 弹窗/选项就绪 | picker 状态机重试预算 | 代码与名称成对回读 | 原轮失效即停 | 弹窗不可逆,需人工接管 |
| layui/ant/select2/element | 组件等待,不注入文本 | 代码 + 显示 | 真实选项出现 | 同上 | 模型回读 | 同上 | 模型不可验证 → 等待人工 |
| table(行任务) | 半填行保留、加行预算 | 行原子数据 | 网格稳定(两次行数一致) | 加行预算 25/条目数+2 | 行回读 | 原轮失效即停 | 无表/加行失败达阈值 |
- H04.4 收紧:校验错误归因不再用短 id 做子串匹配,改为词边界匹配(短 id 不得命中其他字段错误文案);同 id 作为独立词元仍可归因。
- Changes(续):
  - 行任务取消:新增 `SettleRegistry`(多阶段 pending 并存)替换"只保留最新 settleRun";`runDynamicTableFill` 及 5 个公开行填充入口增 `isCancelled` 谓词,循环每个恢复点与写入前复核原轮;content 行任务与回发补写轮次传入 `() => !runStillActive(ctx)`。
  - picker 取消:`runMinimalPicker`/`pickSchool`/`pickMajor`/`pickInPage` 增 `isCancelled`,在等待弹窗、每轮查询前、点击结果行前、等待回填期间复核;content 传 `() => !runStillActive(ctx)`。
- Tests:`v6-H04-picker等待不放行子项`、`v6-H04-人工前子项零写`、`v6-H04-人工完成后重新验证并继续`(契约级)、`v6-H04-较早阶段的settle不被覆盖`、`v6-H04-已取出的settle不重复`、`v6-H04-收口取回剩余阶段`、`v6-H04-短id不得命中他字段错误`、`v6-H04-独立词元仍可归因`;ext:`run-e2e`「H04 行任务 await 期间换档案停止写入」「H04 picker await 期间换档案停止写入」(两条均经变异验证:去掉取消检查 → 断言失败并给出写入证据)。
- 负向自检(实测):行任务取消谓词移除 → `test:regression:e2e` 退出 1(rows=6 全部写完);picker 取消谓词移除 → 退出 1(出现 choose 且代码/名称被写)。撤销后均 0。
- 未做浏览器级断言的 driver(不宣称全覆盖):组件下拉(layui/ant/select2/element)、日期/月份面板、表格行内提交按钮的取消路径只有既有单测/契约测试;`isCancelled` 已接入 picker 与行任务两条主路径。

## Task: H05 — 报告内容脱敏、保存证据与最终矩阵

- Status: passed(第 3 项部分,见 Remaining)
- Production entry:`fill-task.toPlainFillItem`、`background.sanitizeItems`、`check-adapters` 证据校验、`fill-telemetry.fixedFieldLabel`。
- Changes:
  - 跨上下文 DTO 改用固定字段标签(数组路径 → 固定类别+行号),不再携带页面标签原文;`reason` 不再跨上下文传输,只保留白名单 `issueCode`。
  - 接收端(background)同样不信任发送端 label/reason:按 field 重算固定标签、issueCode 必须命中 `ISSUE_CATALOG`。
  - 证据 `configHash` 改为哈希**完整字段契约**(含 dependsOn/dependencyWait/driver/选择器,键序稳定),不再只哈希字段名——新增依赖等待等配置变化会使旧证据失效。旧证据按新口径重算更新(`test/evidence/pilot-ustb-education.json`)。
- Tests:`v6-H05-DTO不得携带页面标签与reason`、`v6-H05-接收端剥离页面标签与reason`;`check:adapters` 六项篡改拒绝保持。
- Remaining(如实):H05.3"保存证据绑定包/页面版本与表格身份、30 分钟有效期"未新增(现有 save-guard 的表格证据与假保存检测保持原样);H05.6 CI 未在真实远端运行。

## 最终门禁实测(2026-09-10 本轮)

| 命令 | 退出码 |
|---|---|
| `npm run typecheck` | 0 |
| `npm test` | 0(v6-audit 全绿;v5-audit 全绿;v5-audit 异步用例全绿) |
| `npm run check:adapters` | 0(含新哈希口径;六项篡改仍各 1) |
| `npm run test:regression` | 0(HARD 58 / FAIL 0) |
| `PW_HEADLESS=1 npm run test:e2e` | 0 |
| `PW_HEADLESS=1 npm run test:regression:e2e` | 0(含 H01/H03 新浏览器断言 + 8 个依赖场景) |
| `node test/dependency-e2e.mjs` | 0(8 场景) |
| `node test/dependency-e2e.mjs --negative-sync` | 1(预期失败) |
| `git diff --check` | 0 |

负向自检:H01 首项推断恢复 → 1;H02 修订校验禁用 → 1(撤销后均 0)。变异未留生产开关。

## 源码哈希(sha256 前 16 位,本轮快照)

fill-pipeline `ceae2edd62030730` / filler `e3767a2d74aa594f` / control-drivers `10b8a060af311701` / fill-session `1523b677225c9054` / fill-task `9560e4192537673f` / fill-telemetry `e9c6ce34336fc66d` / dependency-executor `bcfb57576f1e3f02` / settle-registry `cf1ddd26dd6db444` / dynamic-table `0d3c9a967b514738` / minimal-picker `8520ee64c6235300` / school-picker `126d03790118faa0` / major-picker `c54d1400fd4902cb` / task-executor `59d0f8df8a7cd44e` / v6-audit.test `5a4b944d78016f24` / v5-audit.test `52a0504c4fcf666d` / background `1654f701dfe60db5` / aggregation `578079e687898a34` / content `f506be51b3f92bb2` / check-adapters `a01e8e2a4c5ab8bb` / run-e2e `8596fbc4a9ce5c61` / dependency-e2e `62602577b8e13fb4`。

## 明确保留(不静默)

- `liveVerified=false`:未访问真实高校认证站点、未读 Cookie、未用真实账号。
- `.github/workflows/offline-gates.yml` 未在真实 CI 运行;未提交、未 push。
- 证明层级保留:H03 的"旧文档回报/乱序 seq"为 bg(真实 background 入口)而非浏览器内;H04 的组件/日期/行内提交取消路径无浏览器断言(见各卡说明)。

# 实施进度账本 v8(整改 PLAN v8 · J00–J02)

> 后续复审（2026-09-11）：本文件保留DS原结论。Codex复现并直接修复了暂停序号、恢复确认、结果合并、暂停到期统计、旧广播异常及迁移边界等缺陷。当前状态见`codex-v8-handoff-2026-09-11.md`和`../analysis/DS-v8复审与直接修复报告-2026-09-11.md`；v9用于本轮已完成修复的交接复核，不要求重复实施。

> 依据:`docs/analysis/DeepSeek-V4-Flash-整改PLAN-v8.md`、`DS-v7复审与接管报告-2026-09-10.md`、`docs/dev-notes/codex-v7-handoff-2026-09-10.md`。
> 规则:passed 前检查强制项;强制项未满足只能 in_progress/failed。历史 v5/v6/v7 账本只作历史,不作当前结论。
> 执行者:DeepSeek(接手)。基线:HEAD `97d78d3` + 工作区未提交改动(含 Codex v7 直接修复)。

## 接手前基线复核(2026-09-10,实跑)

`typecheck 0 / npm test 0 / check:adapters 0 / test:regression 0(HARD 58/0) / test:e2e 0 / test:regression:e2e 0 / dependency 8 场景 0 / driver 22 场景 0`;负向 `--negative-sync`、`--ignore-cancellation` 各退出 1。日志:`docs/analysis/ds-v8-verify-2026-09-10/final-*.log`。

## Task: J00 — 取消和 deadline 必须停止原轮并正确报告

- Status: passed
- Production entry:`content/index.ts`(`runLifecycles`/`deactivateRun`/`cancelActiveRun`/`runStillActive`/`FILL_STOP` 处理/`publishResult`)、`background/index.ts`(`stopParticipants`、deadline 分支)、`aggregation.unterminatedParticipants`。
- Changes:
  - **J00.1 显式轮次状态**:每轮 active/cancelled/expired(`runLifecycles`,有界 16 条);`runStillActive(ctx)` 除 runId/URL/档案修订外还检查该状态,因此取消/超时后即使 runId 未变也失效。
  - **J00.2 及时取消**:档案变更(storage onChanged)、新轮替换、用户取消统一走 `cancelActiveRun` → 标记状态、清 settle/异步工作/级联/终态定时器、**主动上报 `FILL_TERMINAL(terminalKind:'cancelled')`**,不等后台 25 秒误报"页面无响应"。
  - **J00.3 deadline 停止**:后台 deadline 向"已注册未终态"参与者发 scoped `FILL_STOP(runId, frameId)`;content 核对 run/document 后置为 expired,已写值保留(不自动撤销用户数据)。
  - **J00.4 迟到 Promise**:`sendResult(true)` 要求该轮仍 active;`finishFillBanner` 增加轮次作用域(旧轮不得宣告完成、不得解锁新轮按钮);补填回调改用含生命周期的 `runStillActive`。
  - **J00.5 准确提示**:superseded/cancelled 不再显示"未登录/无法开始填写",也不解锁运行中的新轮;取消/超时各有独立文案。
  - **J00.6 汇总一致**:取消上报带本轮已完成结果(不丢结果让 total 变 0);未完成项由 terminalKind 表达。
- Tests(unit/bg):`v8-lifecycle` 6 组——deadline 只向未终态参与者发停止通知(带 frameId)、超时收口报缺失、主动取消立即收口且不报超时、取消保留已完成计数、终态后迟到结果被拒、新轮汇总不被旧轮污染、生命周期判定。
- ext:`deadline-stop-e2e.mjs`(仅测试构建把 deadline 缩短为 1500ms,子 frame 选项 12s 才出现)——超时后**迟到选项出现也不再写入**,汇总如实报未完成;`run-e2e` 新增「J00 换档案及时取消提示」断言(面板提示已停止且**不得**报"页面无响应")。
- 负向自检(实测):移除后台 `stopParticipants` → `deadline-stop-e2e --ignore-deadline-stop` 退出 1,证据 `{"options":2,"value":"软件工程"}`(迟到选项被写入);撤销后 0。
- 证明层级(如实):帧级超时/取消为真实浏览器断言(测试专用构建缩短 deadline);乱序/重复 seq/注册封口/回执为真实 background 入口 VM(bg)。

## Task: J01 — 人工接管后的续轮必须与"终态即最终"一致

- Status: passed
- 方案选择:**可恢复暂停**(PLAN J01.1 的推荐方案之一),不使用"新 run"。理由:后台保留轮次即可让续轮结果进入同一汇总,避免跨轮关联与统计口径分叉。
- Production entry:`content`(`publishResult` 三态出口、`scheduleManualResumeRound`、`mergeResumeResults`)、`background/index.ts`(`FILL_PAUSE`/`FILL_RESUME`、`refreshWaitPolicy`、`MANUAL_PAUSE_BUDGET_MS`)、`aggregation`(`setPaused`/`pausedOnlyPending`)。
- Changes:
  - **J01.2 暂停不是终态**:仅剩人工接管时上报 `FILL_PAUSE`(而非 FILL_TERMINAL),后台保留轮次与已收结果;全部未终态参与者都在等待人工时,**撤掉 25s 硬 deadline,改用有界暂停预算(5 分钟)**——正常人工等待不再被报成页面失联。
  - **J01.3/5 续轮**:人工完成 → `completeManualPicker` → `scheduleManualResumeRound`:① 发 `FILL_RESUME` 解除暂停并恢复等待策略;② 重新读档案并跑一轮填写,让被父 picker 阻塞的**依赖者在父重新验证后放行**;③ 结果与暂停前结果按"完成优先"合并,面板与汇总同步更新。
  - **J01.4 不重复点击**:沿用既有守卫(已 filled / 值非空 / 本轮已标记 done 即不再重试);新的一次显式填写仍可重试。
  - **J01.6 失效不恢复**:导航/换档案/用户取消后 `runStillActive` 为假,人工回调与续轮都不再执行。
  - 暂停预算耗尽 → 后台按 `waiting-manual` 类别收口并发送停止通知,content 置 expired(此后不再写)。
- Tests:`manual-handoff-e2e.mjs`(真实扩展 + 合成合同:自动 picker 失败 → 人工接管卡片 → 用户成对回填 → 依赖子项被填写 → 汇总更新且无"页面无响应");`v8-lifecycle` 覆盖暂停/终态语义;`aggregation` 覆盖 setPaused/pausedOnlyPending。
- 负向自检(实测):临时构建注入"人工完成后不续轮"→ `manual-handoff-e2e --ignore-resume` 退出 1(汇总未反映续轮:filled 1/failed 1);撤销后 0。
- 如实说明:依赖子项在续轮之外也会被 2.5/7/15s 补填轮放行(既有机制);续轮的价值是**即时(400ms)完成 + 汇总一致 + 显式解除后台暂停**——负向证据正是"缺续轮时汇总不一致"。

## Task: J02 — 旧诊断迁移、回执边界和最终验收

- Status: passed
- Production entry:`fill-telemetry.restoreFillTelemetryState`(整段重写为 schema 重建)、`normalizeTelemetryCounts`、`buildDiagnosticSummary`。
- Changes:
  - **J02.1 旧数据按当前 schema 重建**:不再用对象展开回填旧 title/detail/currentLabel/events/未知键/旧 URL;stage/level/action/targetLabel/field/issueCode/reason 全部经登记表校验,title/detail 由已校验事件重建。
  - **J02.2 保留合法信息**:计数键有界合法、固定动作、固定字段标签、问题码、固定原因模板保留;结构不合法返回 null(不把坏数据当空状态混入)。
  - **J02.3 独立标记测试**:短中文姓名/短英文姓名/纯 ASCII 令牌/对象键/path/query/stats 扩展/地址/论文标题共 9 类**各自独立**断言(不再混在一条中文串里)。
  - **J02.4 回执边界**:已覆盖区域重复注册返回 `already-completed`(不误报未覆盖);活动轮按新区域计数(重复注册不重复计数);容量淘汰后按 unknown-run 明确拒绝。
- Tests:`v8-migration` 30 余项(9 类标记 × 迁移/清洗 + 合法保留 + 未知键/URL + 过期/坏 JSON + 旧摘要 + 新出口 + 回执 4 项)。
- 负向自检(实测):临时加回"旧行为直通"开关 → `npm test` 退出 1,`[v8-migration]` 失败 11 项;撤销后 0。

## 最终门禁实测(2026-09-10,日志 `docs/analysis/ds-v8-verify-2026-09-10/final-*.log`)

| 命令 | 退出码 |
|---|---|
| `npm run typecheck` | 0 |
| `npm test` | 0(v8-lifecycle / v8-migration / v7-* / v6-audit / v5-audit 全绿) |
| `npm run check:adapters` | 0 |
| `npm run test:regression` | 0(HARD 58 / FAIL 0) |
| `PW_HEADLESS=1 npm run test:e2e` | 0 |
| `PW_HEADLESS=1 npm run test:regression:e2e` | 0(含 run-e2e、22 项 driver、8 项依赖、deadline-stop、manual-handoff) |
| `node test/dependency-e2e.mjs` | 0(8 场景) |
| `node test/driver-cancellation-e2e.mjs` | 0(22 场景) |
| `node test/dependency-e2e.mjs --negative-sync` | 1(预期) |
| `node test/driver-cancellation-e2e.mjs --ignore-cancellation` | 1(预期) |
| `node test/deadline-stop-e2e.mjs --ignore-deadline-stop` | 1(预期) |
| `node test/manual-handoff-e2e.mjs --ignore-resume` | 1(预期) |
| `git diff --check` | 0 |

独立定位入口:`npm run test:drivers:e2e`、`npm run test:dependency:e2e`、`npm run test:deadline:e2e`、`npm run test:handoff:e2e`。

## 源码哈希(sha256 前 16 位)

content `2f473c8e086bea0d` / background `06f6891f1dd1c725` / aggregation `7add799c6c0f8eb4` / fill-telemetry `59cce68023e9ce71` / settle-registry `76c6088e892dd49a` / v8-lifecycle `1df8d7e589dcdc14` / v8-migration `f60f6b4252026b13` / run.ts `fe1fd6094f057437` / run-e2e `8e8cf3357109a4fd` / driver-cancellation `f7e1573574d5e4bb` / deadline-stop `748975e68d6510af` / manual-handoff `3c08640b89745850` / dependency-e2e `62602577b8e13fb4` / package.json `8f889b0e77e72d91`。

## 明确保留(不静默)

- `liveVerified=false`:未访问真实高校认证站点、未读 Cookie、未用真实账号。
- 22 项 driver 与 deadline/handoff 场景使用合成 DOM 协议与测试专用构建;不等于真实第三方框架或真实高校页面。
- 乱序/重复 seq/注册封口/回执为 bg(真实 background 入口 VM)证据,非浏览器内。
- `.github/workflows/offline-gates.yml` 未在真实 CI 运行;未提交、未 push。

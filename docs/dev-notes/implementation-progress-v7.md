# 实施进度账本 v7(整改 PLAN v7 · I00–I03)

> **历史文档(2026-09-10 起)**:v7 阶段记录,已由 `implementation-progress-v8.md` 取代;其中"整改完成"结论已被 v8 复审否定(D01–D07),不作当前结论。

> 后续复审（2026-09-10）：本文件保留DS历史结论。“全部满足”已被新增隐私、回执和12秒延迟浏览器反例否定。Codex已直接修复这些问题；当前边界见`codex-v7-handoff-2026-09-10.md`、`../analysis/DS-v7复审与接管报告-2026-09-10.md`和PLAN v8。

> 依据:`docs/analysis/DeepSeek-V4-Flash-整改PLAN-v7.md`、`docs/analysis/DS-v6复审与直接修复报告-2026-09-10.md`、`docs/dev-notes/codex-v6-handoff-2026-09-10.md`。
> 规则:passed 前检查强制项;强制项未满足只能 in_progress/failed。历史 v5/v6 账本只作历史,不作当前结论。
> 执行者:DeepSeek(接手)。基线:HEAD `97d78d3` + 工作区未提交改动(含 Codex 本轮直接修复)。

## 接手前基线复核(2026-09-10,实跑)

`typecheck 0 / npm test 0 / check:adapters 0 / test:regression 0(HARD 58/0) / test:e2e 0 / test:regression:e2e 0 / driver-cancellation 17 场景 0 / dependency-e2e 8 场景 0`;负向 `--ignore-cancellation` 与 `--negative-sync` 均退出 1。日志:`docs/analysis/ds-v7-verify-2026-09-10/base-*.log`(已随最终门禁覆盖为 final-*.log)。

## Task: I00 — 运行完成后晚注册与终态生命周期

- Status: passed
- Production entry:`background/index.ts`(完成轮回执 + 晚注册回执/通知)、`aggregation.ts`(终态即最终)、`content/index.ts`(工作集合归零才发终态 + 边界提示面板可见)。
- Changes:
  - **完成后晚注册可见(C05)**:新增有界完成轮回执(TTL 60s、容量 8 轮、每轮最多记录 32 个晚注册区域);收口后到达的 `FILL_REGISTER` 得到 `{ok:false, reason:'run-completed', covered:false, lateRegions}` 回执,并按**新区域**(frameId::docId 去重)向该区域发 `FILL_LATE_REGISTRATION`、向顶层发 `FILL_ROUND_NOTICE`;未知轮返回 `unknown-run`。不重开已取消轮、不混入新轮统计、不保留 DOM/资料。
  - **终态生命周期(I00.4/5)**:content 新增 `frameWorkPending()`(settle 待验证 + 级联下拉 watcher + 依赖/picker/行任务/日期组件/补填)+ `scheduleTerminalWhenIdle()`(250ms×40 有界);终态只在该帧工作集合归零后发送,不再用 15s+470ms 冒充工作结束;每轮只发一次终态(`markTerminalSent`)。
  - **语义统一(I00.6)**:`accept()` 拒绝已终态参与者的更高 seq 更新(终态即最终),与 background"收口即删轮"一致;被拒的旧轮/旧 seq 不改变终态。
- Tests(unit/bg):`v7-lifecycle` 7 项——收口后注册未覆盖回执、顶层未覆盖提示、重复晚注册不重复计数、按新区域递增、未知轮拒绝、收口后结果不重开统计、回执容量有界、未终态区域只报超时+missing、等待人工独立终态类别;`aggregation` 改为断言"终态后更高 seq 被拒绝 + 结果保持不变"。
- ext:`run-e2e` H03 跨 frame 场景新增精确计数(`counts.total === 5`)、失败字段计入"需人工"、子 frame 延迟选项被补填、顶层不得提前计入子 frame 目标。
- 负向自检(实测):把 `frameWorkPending()` 恒置 false(即取消工作集合门禁)→ `test:regression:e2e` 退出 1,命中"H03: 子 frame 未终态前顶层汇总不得计入其目标";撤销后 0。
- 证明层级(如实):帧级生命周期为真实浏览器断言;`旧文档回报/乱序 seq/重复 seq/超时/等待人工` 为**真实 background bundle 消息入口**的 VM 断言(bg)。浏览器内无法伪造帧级乱序消息,且任务书禁止给正式扩展增加测试接口,故不再造浏览器级版本。

## Task: I01 — 剩余 driver 取消边界与写入所有权清单

- Status: passed
- Production entry:`blue-flat-picker-driver.pickBlueFlatIdentity`、`filler.pickWidgetDropdown/pickInPage`、`dynamic-table.runDynamicTableFill/handleDialogAfterClick`、`minimal-picker-common.runMinimalPicker`(v6 已接)、`school/major-picker-driver`(透传)。
- Changes:
  - **BlueFlat(I01.2)**:新增 `isCancelled`,在"等待弹窗作用域、每轮查询前、点击结果行前、等待回填期间、写代码/名称前、兜底写入前"共 7 处复核;`pickSchool/pickMajor` 透传。
  - **widget 下拉(I01.3)**:`pickWidgetDropdown` 新增 `isCancelled`,在"主世界点选返回后、轮询浮层每轮、过滤等待后"复核;`pickInPage` 分发时透传。
  - **通用选择窗口/地区树**:沿用既有 `pickInPageInner` 的 abort 谓词,并与原轮取消合并(`() => aborted || !!isCancelled?.() || !el.isConnected`)。
  - **动态表(I01.4)**:`matchExisting` 之后、dialog 处理前、`handleDialogAfterClick`(新增谓词)、行内提交按钮(postback 落库,新增"点击前/回写等待后"两次复核)、blob 隐藏串写入前均复核原轮;行内提交仍只在 `allowCommitActions && maxAddAttempts>0` 且按钮为明确 DoPostback 加行动作时才点击(不扩大自动保存授权)。
- 所有权清单(I01.5,如实):

| 写入入口 | 是否登记 ownership | 恢复可用性 |
|---|---|---|
| `filler.setInputValue/pickOption/setSelectValue/setRadioGroup`(通用) | 是(record 含 runId/epoch/revision) | 可恢复(仅 text/textarea 且真实 input.type 可逆) |
| `control-drivers.fillText/fillSelect/fillRadioGroup`(合同) | 是 | 同上 |
| 组件下拉/弹窗点选(`pickWidgetDropdown`/`pickComponentOption`/blue-flat/minimal) | 仅标记 `data-tui-value`+高亮,**不登记 WriteRecord** | 恢复不可用:明确走 notAttempted,不伪造成功 |
| 动态表行写入(`runDynamicTableFill` → spec.fillRow) | 记录由行内 `setInputValue` 承担;表级不额外登记 | 行内文本可恢复;隐藏串/提交按钮不可逆 |
| 日期/月份面板 | 不登记 | 恢复不可用(不可逆驱动) |
| `beginWriteScope` 作用域 | 只覆盖**同步**写入(Codex 本轮修复);异步子 driver 由 `options.run` 逐次绑定 | 跨 await 不再持有全局作用域 |

- Tests:`driver-cancellation-e2e` 22 场景(原 17 + **blue-flat 3**：normal/cancel/detach + **widget 2**：normal/cancel),真实浏览器执行生产 driver、DOM 协议夹具;`v7-review`(Codex)保留 A/B 交错作用域断言;`run-e2e` H04 行任务 await 期间换档案停止写入。
- 负向自检(实测):删掉 BlueFlat 的 7 处取消检查 → `driver-cancellation-e2e` 退出 1,命中 `blue-flat/cancel: 取消后不得选择结果行`;删掉 widget 3 处 → 退出 1,命中 `widget/cancel: 取消后不得点选选项`;撤销后均 0。整体 `--ignore-cancellation` 仍退出 1。
- 保留:北科 14 行、合工大三联、8 项依赖、React/Vue、真实恢复用例全部保持通过(见最终门禁)。
- 证明层级(如实):22 项 driver 场景使用**合成 DOM 协议**,不等于安装了真实 Ant/Element/select2/layui/jqx 框架,也不等于 22 个真实高校页面。

## Task: I02 — 遥测、报告与持久化内容脱敏

- Status: passed
- Production entry:`fill-telemetry.reduceFillTelemetry/safeTelemetryReason/safeTelemetryLabelText/buildDiagnosticSummary/sanitizeDiagnosticValue`、`filler`(摘要写入)、`scanner.sanitizeScanForDiagnostics`、`content.buildReport`。
- 出口清单(I02.1):

| 出口 | 保留内容 | 禁止内容 |
|---|---|---|
| `FILL_RESULT`/`FILL_TERMINAL`/`FILL_DONE` DTO | 固定字段标签(`fixedFieldLabel`)、field、status、白名单 issueCode | 页面标签原文、reason、valuePreview、pickerContext、完整 URL |
| `REPORT_RESULT`(字段报告) | 结构调整签名(标签/选项只留计数)、字段 tag/type/name/id、匹配结果、issueCode 目录、调试块(已清洗) | 页面标签/表头/按钮原文、单元格样例、资料值、页面错误原文 |
| sessionStorage `tui-fill-telemetry-v1` | 事件动作、固定字段标签、问题码固定文案、计数 | 页面原文、资料值、页面错误原文(≥3 字非 ASCII 一律折叠为长度标记) |
| sessionStorage `tui-fill-summary` | 计数 + 固定字段标签 + 状态 + issueCode | 资料值、页面标签原文、页面错误原文(`profileLists` 已移除) |
| sessionStorage `tui-site-scan` | 结构签名(表头只留长度、样例清空、按钮文本固定) | 表头/单元格/按钮原文 |
| 调试块(`tui-pick/rowjobs/click/addbtn/wfp`-debug) | ASCII 结构标识、数值、布尔 | 非 ASCII 页面文本(折叠为 `文本(N字)`)、超长字符串 |
| 漏填清单(用户点「复制漏填项」) | 字段与目标值 —— **明确定义的"用户导出(含资料)"**:只在内存生成、直接进剪贴板、不落盘、不发消息 | — |

- Changes:
  - 持久化 reason 只允许"问题码固定文案"或登记过的固定模板前缀,其余折叠为通用文案(页面错误原文如"值已写入但页面报本字段错误:xxx"不再落盘)。
  - 持久化标签:短纯文字字段名(≤8 字、无数字、无标点/下划线)可用,否则回退固定字段标签(保证面板仍显示"姓名"这类可定位信息,又不落"父亲姓名：张三")。
  - 摘要/站点扫描/调试块全部改走清洗入口;报告字段表去掉页面标签与选项原文(选项只留数量)。
- Tests(unit):`v7-telemetry` 6 项——reason 不落页面原文且保留"未稳定接受"可定位信息、有 issueCode 用固定文案、持久化标签为固定类别、诊断摘要不携带资料(且丢弃未登记问题码)、站点扫描只留结构签名、调试块不落页面原文且长度有界。
- ext(C06 硬断言):LZU 夹具注入合成姓名/标题/地址标记(页面标签 + 页面错误容器),填充后断言 `tui-fill-telemetry-v1`/`tui-fill-summary`/`tui-site-scan` 三者均不含标记且仍保留固定字段标签。
- 负向自检(实测):把 `reduceFillTelemetry` 改回"原文直落" → `test:regression:e2e` 退出 1,命中 3 个标记;撤销后 0。
- 兼容性调整(非削弱):`P10b` 长文保护断言由"摘要含中文原因"改为"摘要含固定问题码 E1206";E2E 面板逐字段日志断言经"短标签白名单"保持(仍显示"姓名")。

## Task: I03 — 证据归档、当前状态与最终门禁

- Status: passed
- Changes:本账本 + `regression-coverage-v7.md` 单一当前状态表;README 增"能力边界与验证层级";历史 v5/v6 账本与矩阵标注历史;保存证据 schema2 仅维护回归(Codex 已实现,`v7-review` 覆盖)。
- 证据 hash 绑定:见本文末哈希(本轮实测源码)。

## 最终门禁实测(2026-09-10,日志 `docs/analysis/ds-v7-verify-2026-09-10/final-*.log`)

| 命令 | 退出码 |
|---|---|
| `npm run typecheck` | 0 |
| `npm test` | 0(v7-lifecycle / v7-telemetry / v7-review / v6-audit / v5-audit 全绿) |
| `npm run check:adapters` | 0 |
| `npm run test:regression` | 0(HARD 58 / FAIL 0) |
| `PW_HEADLESS=1 npm run test:e2e` | 0 |
| `PW_HEADLESS=1 npm run test:regression:e2e` | 0(含 I02 脱敏断言、I00 精确计数、H01/H03/H04 场景、22 项 driver、8 项依赖) |
| `node test/dependency-e2e.mjs --negative-sync` | 1(预期) |
| `node test/driver-cancellation-e2e.mjs --ignore-cancellation` | 1(预期) |
| `git diff --check` | 0(本轮曾因 python 编辑引入 CRLF,已全部归一为 LF) |

负向自检汇总(H01 首项推断 / H02 修订校验 / 行任务取消 / picker 取消 / 工作集合门禁 / BlueFlat 取消 / widget 取消 / 遥测脱敏 → 各自移除后对应断言失败;撤销后全部 0,无生产开关残留)。

## 源码哈希(sha256 前 16 位)

background `3ea13e2a96548cd8` / aggregation `87c44fdbfb046f3a` / content `3de16ee55534d139` / fill-telemetry `8f6e5d81f4862e5c` / scanner `777b20bb22094f73` / filler `3f36942a25bbdf3d` / dynamic-table `2d89a73213c75deb` / blue-flat `286b48685e419620` / school-picker `c9929795b489e089` / major-picker `77ced7aed10666fe` / minimal-picker `4ab80d52e5444863` / settle-registry `cf1ddd26dd6db444` / task-executor `2d7d0b69059bd281` / v7-lifecycle.test `769ef440d5aeb7f5` / v7-telemetry.test `b0aa8c4ccda4b543` / v6-audit.test `5a4b944d78016f24` / run.ts `34a8f819e61a54cb` / run-e2e `750749297debed65` / driver-cancellation-e2e `f7e1573574d5e4bb` / dependency-e2e `62602577b8e13fb4`。

## 明确保留(不静默)

- `liveVerified=false`:未访问真实高校认证站点、未读 Cookie、未用真实账号。
- 22 项 driver 场景为合成 DOM 协议,不等于真实第三方框架安装或真实高校页面。
- `旧文档/乱序 seq/重复 seq/超时/等待人工` 为 bg(真实 background 入口 VM)证据,非浏览器内。
- `.github/workflows/offline-gates.yml` 未在真实 CI 运行;未提交、未 push。

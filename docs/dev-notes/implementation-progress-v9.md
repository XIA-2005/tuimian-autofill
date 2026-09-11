# 实施账本 v9(整改与复核 PLAN v9 · K00–K04)

> 依据:`docs/analysis/DeepSeek-V4-Flash-整改与复核PLAN-v9.md`、`DS-v8复审与直接修复报告-2026-09-11.md`、`docs/dev-notes/codex-v8-handoff-2026-09-11.md`。
> **K00–K03 由 Codex 直接实施**(本账本为记录,不是 DS 的实施成果);**K04 由 DeepSeek 执行交接复核**。
> 历史 v5–v8 账本只作历史;其中"完成"结论均已被后续复审否定。

## 状态总表

| 卡 | 状态 | 证据 |
|---|---|---|
| K00 暂停消息顺序与等待预算 | 已实施(Codex)+ 独立复验通过 | 修正后的自备探针 K00 组 18 条全绿:`docs/analysis/ds-v9-verify-2026-09-11/independent-probes.json` |
| K01 后台确认与续轮最新结果 | 已实施(Codex)+ 独立复验通过 | 自备探针 K01 组 6 条 + `manual-handoff-e2e`(含 `--reject-resume`) |
| K02 旧诊断身份与时间边界 | 已实施(Codex)+ 独立复验通过(DS) | 自备探针 K02 组 6 条 |
| K03 测试可信度 | 已实施并复核通过 | `runId: firstRun` 已修正；三处源码变异均唯一命中；四项负向均由目标业务断言退出 1 |
| K04 交接复核 | **passed(当前态)** | 135 个源码/测试源/构建配置文件门禁前后聚合哈希一致；主门禁全 0；4 负向全 1；修正后探针 30/30 |

## K04 交接复核明细(2026-09-11)

### 0. 并发改动历史与当前状态

DS 复核时确实遇到另一会话写入，因此其 00:38 证据只对旧冻结态有效。该会话随后完成了同字段双控件生产修复与负向测试加固。当前已经在单一串行进程中重新冻结并验证：135 个源码、测试源和构建配置文件门禁前后聚合 SHA-256 均为 `F0DEF0373EFB8C7CC3FEB9729280D92C022221CE163244955F6F182212E396B8`，`changed=0`。旧并发告警不再是当前阻塞项。

### 1. 工作区哈希核对(不依赖旧 HEAD)

旧 v9 manifest 作为历史基线保留，逻辑修复及 v2.0.6 发布整理的覆盖哈希记录在 `docs/analysis/codex-v9-followup-2026-09-11/source-change-manifest.json`。`tools/verify-v9-hashes.cjs` 会叠加两层清单；发布态结果为 135/135、后续覆盖 9/9、漂移 0、缺失 0。

本轮被改动的 13 个文件:aggregation.ts、background/index.ts、content/index.ts、fill-merge.ts、fill-telemetry.ts、v8-lifecycle.test.ts、v9-protocol.test.ts、v9-review.test.ts、test/run.ts、deadline-stop-e2e.mjs、manual-handoff-e2e.mjs、package.json、test/.v9-tmp-run.mjs。

### 2. 门禁(全部实跑,日志 `docs/analysis/ds-v9-verify-2026-09-11/`)

| 命令 | 退出码 |
|---|---|
| `npm run typecheck` | 0 |
| `npm test` | 0 |
| `npm run check:adapters` | 0 |
| `npm run test:regression` | 0(HARD 58 / FAIL 0) |
| `PW_HEADLESS=1 npm run test:e2e` | 0 |
| `PW_HEADLESS=1 npm run test:regression:e2e` | 0 |
| `git diff --check` | 0 |

### 3. 正向独立定位

| 入口 | 退出码 | 场景 |
|---|---|---|
| `test:dependency:e2e` | 0 | 8 |
| `test:drivers:e2e` | 0 | 22 |
| `test:deadline:e2e` | 0 | 1 |
| `test:handoff:e2e` | 0 | 1 |
| `manual-handoff-e2e.mjs --reject-resume` | 0 | 1 |

### 4. 负向自检(均退出 1)

| 命令 | 退出码 | 失败形态 |
|---|---|---|
| `manual-handoff-e2e.mjs --ignore-resume` | 1 | 断言型：子手机号为空，预期 `13800000000` |
| `deadline-stop-e2e.mjs --ignore-deadline-stop` | 1 | 断言型 `J00: 超时停止后不得写入迟到选项` |
| `dependency-e2e.mjs --negative-sync` | 1 | 断言型：学校代码为空，预期 `10700` |
| `driver-cancellation-e2e.mjs --ignore-cancellation` | 1 | 断言型 `ant/cancel: 取消/移除后不得搜索或选择` |

### 5. 自备探针(30 条,不复用 Codex 测试)

`docs/analysis/ds-v9-verify-2026-09-11/independent-probes.cjs`:覆盖序号严格递增、姊妹消息守卫一致性、预算切换、到期去重与快照保留、STOP 文档身份、旧广播异常隔离、同字段双控件合并、旧诊断身份与时间边界。E07 已改为等待旧 Promise 异常实际落地后再验证新轮。**30/30 通过。**

补充核对(content 侧,防"载荷对了实现没用"):`FILL_STOP` 用 `documentIdentity(document)` 核对当前文档;人工到期与超时文案分离。

### 6. 后续直接修复

DS 本人没有修改生产代码；后续复审发现同字段双控件的旧目标会被字段名误判为已确认，已在 `fill-merge.ts` 最小修复并补测试。同时加固 dependency/manual 两条负向自检。没有新增任务卡或扩大产品范围。

## 发现的问题与处置

1. `test/.v9-tmp-bundle.cjs`、`test/.v9-tmp-run.mjs` 仍按用户边界保留，未删除。
2. 两条超时型负向自检已改为字段值断言；dependency 变异已补唯一锚点检查。
3. DS 的 E07 探针时序假通过风险已修正，并重新运行 30/30 通过。

## 证明边界(不夸大)

- 22 项 driver = 合成 DOM 协议,不等于安装真实第三方框架;
- 协议序/暂停预算 = 真实 background 入口 VM;deadline/人工恢复 = 测试专用构建;
- `liveVerified=false`;远端 CI 未运行;未提交、未 push。

## 当前源码证据

完整门禁前后 135 文件聚合 SHA-256：`F0DEF0373EFB8C7CC3FEB9729280D92C022221CE163244955F6F182212E396B8`。旧 v9 基线加四项后续覆盖哈希共同描述当前源码；详见 `DS-v9复审与直接收口报告-2026-09-11.md`。

# 覆盖矩阵 v6(H00–H05 · 2026-09-10)

> **历史文档(2026-09-10 起)**:v6 阶段矩阵,已由 `regression-coverage-v7.md` 取代。

> 单一最终状态表。历史矩阵 `regression-coverage-v5.md` 与账本 `implementation-progress-v5.md` 仅作历史,不再作为当前结论(v5 中"G07a passed"与"G07a in_progress"并存的自相矛盾表已由本轮 v6 账本取代)。
> 证明层级:unit=纯单测;contract=真实生产模块/编排;ext=真实打包扩展浏览器断言;bg=真实 background 入口(bundle + VM)。
> 源码哈希(sha256 前 16 位,本轮快照):fill-pipeline `ceae2edd62030730` / filler `709fc963d390c74f` / control-drivers `10b8a060af311701` / fill-session `1523b677225c9054` / fill-task `9560e4192537673f` / fill-telemetry `e9c6ce34336fc66d` / background `e4656d143fa4c582` / aggregation `12705e6034ab16fc` / content `dcb39031c442250b` / check-adapters `a01e8e2a4c5ab8bb` / task-executor `59d0f8df8a7cd44e` / run-e2e `77f76f19aa52a3fb` / dependency-e2e `62602577b8e13fb4` / v6-audit `9f5458a7e8ad955e`。

## 一、最终状态

| 卡 | 状态 | 关键证据 |
|---|---|---|
| H00 | passed | 复审1–7 转硬断言(v6-audit);同步入口遇依赖页只返回待异步处理;H01 变异 → 退出 1 |
| H01 | passed | 首项合法值不覆盖/同值零事件/占位照常填 + label 重复 ID 全歧义 + radio 无 name 不合成组;ext 正负例 |
| H02 | passed | 写入记录绑定 runId/代际/修订;恢复必须传原轮 ctx;真实 input.type 非文本不恢复;变异 → 退出 1 |
| H03 | passed | 随机文档身份、注册封口、deadline 25s、终态类别(done/waiting-manual/cancelled)、未响应/晚注册面板可见;两 frame 浏览器断言 + 真实 background 协议序断言 |
| H04 | passed | 行任务/picker 取消谓词(浏览器断言均经变异验证)、多阶段 settle 并存、人工接管后重新验证继续、逐 driver 策略表;组件/日期/行内提交取消路径无浏览器断言(见保留) |
| H05 | passed | DTO 双向固定标签、reason 不跨上下文;证据哈希覆盖完整字段契约(配置变化使旧证据失效) |

## 二、复审反例逐条(来源:`ds-v5-review-2026-09-09/audit-v5-probes.cjs`,脚本局部 ID 非 v3 R01–R24)

| 复审 | 期望 | 测试 | 生产入口 | 层级 | 结果 |
|---|---|---|---|---|---|
| 1 首项覆盖 | 用户点选首项不被覆盖 | v6-H01-首项合法值不得被覆盖 / 首项同值零写事件 / 合同首项合法值不得被覆盖 | existingValueDecision / guardExistingScalar | contract | 通过 |
| 2 label 重复 ID | 两个同 id 目标均零写 | v6-H01-label重复ID两个均零写 | resolveContractControl(label[for] 全量收集) | contract | 通过 |
| 3 依赖被通用链绕过 | 同步入口不得抢写依赖页 | v6-H00-同步入口不得抢写依赖子字段 | runFillPipeline 依赖页守卫 | contract | 通过 |
| 4 旧修订恢复 | 档案修订后旧记录不得恢复 | v6-H02-旧修订记录不得授权恢复 | conditionalRestore(修订校验) | contract | 通过(变异 → 1) |
| 5 通信 docId 重用 | 跨实例身份不同 | v6-H03-通信文档身份跨实例不同 | fill-session.documentIdentity | unit | 通过 |
| 6 被拒终态改状态 | 被拒终态不得改完成标志 | v6-H00-被拒终态不得改变完成标志 | aggregation.terminalize | unit | 通过 |
| 7 注册集合未封口 | 封口前不得提前完成 | v6-H03-注册未封口不得提前完成 / 晚注册帧必须计入完成汇总 | background 注册封口窗口 | bg | 通过 |

## 三、v5 遗留与 v3/v4 未取消项(回归)

| 项 | 测试/入口 | 结果 |
|---|---|---|
| G07a 异步依赖(8 场景) | `test/dependency-e2e.mjs`(normal/same/conflict/empty/timeout/cancel/replace-parent/parent-rejected)+ `--negative-sync` → 1 | 通过 |
| V01–V07 | `src/core/v5-audit.test.ts`(含异步 G07a 用例) | 通过 |
| R02–R24 / Q01–Q13 | `npm test` / `test:regression`(HARD 58/0)/ `test:e2e` / `test:regression:e2e` | 通过 |
| G03 合同清空、G04 档案修订、G06 真实恢复 | `test/regression/run-e2e.ts`(LZU 夹具) | 通过 |
| H01/H03/H04 新浏览器断言 | `test/regression/run-e2e.ts`(first-option / frame-parent / rowjobs / picker-page 夹具) | 通过(行任务与 picker 两条经变异 → 1 验证) |
| 合工大三联 / 北科 14 行 | `npm run test:e2e` | 通过 |
| 证据六项篡改 | `npm run check:adapters` | 各退出 1 |

## 四、最终门禁(2026-09-10 本轮实测)

| 命令 | 退出码 |
|---|---|
| `npm run typecheck` | 0 |
| `npm test` | 0 |
| `npm run check:adapters` | 0 |
| `npm run test:regression` | 0(HARD 58 / FAIL 0) |
| `PW_HEADLESS=1 npm run test:e2e` | 0 |
| `PW_HEADLESS=1 npm run test:regression:e2e` | 0 |
| `node test/dependency-e2e.mjs` | 0(8 场景) |
| `node test/dependency-e2e.mjs --negative-sync` | 1(预期失败) |
| `git diff --check` | 0 |

## 五、明确保留(不静默)

- 证明层级:H03 的"旧文档回报/乱序 seq/重复 seq"为 bg(真实 background 入口 VM 验证),非浏览器内;H04 的组件下拉/日期面板/行内提交取消路径无浏览器断言。
- `liveVerified=false`;CI 未在远端运行;未提交、未 push。

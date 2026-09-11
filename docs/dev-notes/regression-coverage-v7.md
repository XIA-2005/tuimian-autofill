# 覆盖矩阵 v7(I00–I03 · 2026-09-10)

> 单一当前状态表。v5/v6 账本与矩阵仅作历史,不作当前结论(其中"全部完成"声明已被复审否定)。
> 证明层级:unit=纯单测;contract=真实生产模块/编排;bg=真实 background bundle 消息入口(VM);ext=真实打包扩展浏览器断言;driver=真实浏览器执行生产 driver(合成 DOM 协议)。

## 一、最终状态

| 卡 | 状态 | 关键证据 |
|---|---|---|
| I00 | passed | 收口后晚注册回执/去重/有界(unit+bg);终态由工作集合归零驱动(ext,变异 → 1);终态即最终语义(bg);两帧精确计数 total=5(ext) |
| I01 | passed | BlueFlat 7 处取消 + widget 3 处取消(均变异 → 1);动态表 matchExisting/dialog/行内提交/blob 全覆盖;所有权清单入账本;22 项 driver 场景 |
| I02 | passed | reason/标签/摘要/站点扫描/调试块全出口脱敏(unit);C06 合成标记在真实页面三处落盘诊断中零出现(ext,变异 → 1) |
| I03 | passed | 本矩阵 + v7 账本 + README 能力边界;历史文档标注历史;保存证据 schema2 回归保持 |

## 二、复审反例关闭情况(来源 `docs/analysis/codex-v6-review-2026-09-10/`)

| 编号 | 问题 | 本轮状态 | 证据 |
|---|---|---|---|
| C01 同类不同表假保存 | 已由 Codex 修复 | 关闭 | `v7-review`(表结构身份参与比较) |
| C02 空行占位 select 算 filled | 已由 Codex 修复 | 关闭 | `v7-review` |
| C03 输入与编辑按钮同格 | 已由 Codex 修复 | 关闭 | `v7-review` |
| C04 异步写入作用域重叠 | 已由 Codex 修复 | 关闭 | `v7-review`(A 取消后 B 记录仍为 run-B) |
| C05 完成后才注册的 frame | **本轮修复** | 关闭 | `v7-lifecycle` 收口后回执/去重/有界 + 顶层提示(bg) |
| C06 遥测 reason 内容 | **本轮修复** | 关闭 | `v7-telemetry` 6 项 + ext 合成标记零落盘(变异 → 1) |
| C07 组件取消 | 已由 Codex 修复 | 关闭 | `driver-cancellation-e2e` component 12 项 |
| C08 跨 frame 真实计数 | 已由 Codex 修复 | 关闭 | `run-e2e` H03 `counts.total === 5` |

## 三、证明层级边界(不夸大)

| 层级 | 覆盖内容 |
|---|---|
| unit | 依赖图、值语义、合并、会话/路由、脱敏规则(v7-telemetry)、生命周期纯逻辑 |
| bg(真实 background VM) | 乱序/重复 seq、旧文档回报、注册封口、收口后晚注册、终态类别、超时 missing |
| driver(真实浏览器 + 合成 DOM 协议) | component ant/select2/element/layui ×3、date ×5、blue-flat ×3、widget ×2 = 22 |
| ext(真实扩展 + 本地夹具) | 合工大三联、北科 14 行、LZU 合同清空/恢复、React/Vue 受控、8 项依赖级联、H01 首项、H03 两 frame、H04 行任务/picker 换档案、I02 脱敏 |
| **未覆盖** | 真实高校站点与账号(liveVerified=false)、真实 Ant/Element/select2/layui/jqx 框架安装、远端 CI |

## 四、最终门禁(2026-09-10 实测)

| 命令 | 退出码 |
|---|---|
| `npm run typecheck` | 0 |
| `npm test` | 0 |
| `npm run check:adapters` | 0 |
| `npm run test:regression` | 0(HARD 58 / FAIL 0) |
| `PW_HEADLESS=1 npm run test:e2e` | 0 |
| `PW_HEADLESS=1 npm run test:regression:e2e` | 0 |
| `node test/dependency-e2e.mjs` | 0(8 场景) |
| `node test/driver-cancellation-e2e.mjs` | 0(22 场景) |
| `node test/dependency-e2e.mjs --negative-sync` | 1(预期) |
| `node test/driver-cancellation-e2e.mjs --ignore-cancellation` | 1(预期) |
| `git diff --check` | 0 |

独立定位入口:`npm run test:drivers:e2e`、`npm run test:dependency:e2e`。

## 五、保留

- `liveVerified=false`;远端 CI 未运行;未提交、未 push。

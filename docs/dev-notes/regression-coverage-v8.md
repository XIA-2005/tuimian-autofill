# 覆盖矩阵 v8(J00–J02 · 2026-09-10)

> 单一当前状态表。v5/v6/v7 账本与矩阵仅作历史,不作当前结论(其中"全部完成"声明已被后续复审否定)。
> 证明层级:unit=纯单测;contract=真实生产模块/编排;bg=真实 background bundle 消息入口(VM);driver=真实浏览器执行生产 driver(合成 DOM 协议);ext=真实打包扩展浏览器断言(本地夹具,含测试专用构建)。

## 一、最终状态

| 卡 | 状态 | 关键证据 |
|---|---|---|
| J00 | passed | 轮次 active/cancelled/expired;换档案及时取消(ext,非超时);deadline scoped 停止(ext:迟到选项不再写入,变异 → 1);终态后迟到结果被拒(bg) |
| J01 | passed | 等待人工作为可恢复暂停(暂停预算 5 分钟,bg);人工完成→续轮→依赖子项填写→汇总更新(ext,变异 → 1);完成优先合并不丢人工结果 |
| J02 | passed | 旧遥测/摘要按 schema 重建(9 类隐私标记各自独立断言,unit,变异 → 11 项失败);回执边界 4 项(bg) |

## 二、复审反例关闭情况

| 编号 | 问题 | 本轮状态 | 证据 |
|---|---|---|---|
| D01 ASCII 诊断内容 | 已由 Codex v7 修复 | 关闭 | `v8-migration` 独立 ASCII 令牌断言 |
| D02 短姓名标签 | 已由 Codex v7 修复 | 关闭 | `v8-migration` 短中文/短英文姓名独立断言 |
| D03 扫描 URL | 已由 Codex v7 修复 | 关闭 | `v8-migration` path/query 独立断言 |
| D04 对象键/摘要 stats | 已由 Codex v7 修复 | 关闭 | `v8-migration` 对象键/stats 扩展独立断言 |
| D05 轮询上限伪终态 | 已由 Codex v7 修复 | 关闭 | `run-e2e`「10 秒后仍等待、15 秒补填后才发布最新终态」 |
| D06 终态后继续写 | 已由 Codex v7 修复 | 关闭 | `run-e2e` 12 秒延迟场景 + 本轮 deadline/handoff |
| D07 回执边界 | 已由 Codex v7 修复 | 关闭 | `v8-migration` 回执 4 项 + `v7-lifecycle` |
| **v7 剩余 1** 后台超时不会使原轮失效 | **本轮修复** | 关闭 | J00(scoped 停止 + expired 生命周期 + ext 变异) |
| **v7 剩余 2** 人工完成仍在原轮写 | **本轮修复** | 关闭 | J01(可恢复暂停 + 续轮 + 完成优先合并 + ext 变异) |
| **v7 剩余 3** 旧遥测迁移 | **本轮修复** | 关闭 | J02(schema 重建 + 独立标记断言) |

## 三、证明层级边界(不夸大)

| 层级 | 覆盖内容 |
|---|---|
| unit | 依赖图、值语义、合并、会话/路由、脱敏规则与旧数据迁移(v8-migration)、生命周期纯逻辑 |
| bg(真实 background VM) | 乱序/重复 seq、旧文档回报、注册封口与晚注册回执、终态类别、超时 missing、**deadline 停止通知、暂停/恢复策略、回执去重与容量** |
| driver(真实浏览器 + 合成 DOM 协议) | component ant/select2/element/layui ×3、date ×5、blue-flat ×3、widget ×2 = 22 |
| ext(真实扩展 + 本地夹具/测试专用构建) | 合工大三联、北科 14 行、LZU 合同清空/恢复、React/Vue、8 项依赖、H01 首项、H03 两 frame、H04 行任务/picker 换档案、I02 脱敏、J00 取消提示、**J00 deadline 停止(缩短 deadline)**、**J01 人工接管续轮** |
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
| `node test/deadline-stop-e2e.mjs --ignore-deadline-stop` | 1(预期) |
| `node test/manual-handoff-e2e.mjs --ignore-resume` | 1(预期) |
| `git diff --check` | 0 |

## 五、保留

- `liveVerified=false`;远端 CI 未运行;未提交、未 push。
- 22 项 driver、deadline-stop、manual-handoff 均使用合成协议/测试专用构建,不冒充真实框架或真实站点验收。

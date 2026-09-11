# 覆盖矩阵 v9(K00–K04 · 2026-09-11)

> 单一当前状态表。v5–v8 账本与矩阵仅作历史,其中"完成"结论均已被后续复审否定。
> 证明层级:unit=纯单测;bg=真实 background bundle 消息入口(VM);ext=真实打包扩展浏览器断言(含测试专用构建);driver=真实浏览器执行生产 driver(合成 DOM 协议);tool=可复跑工具。

## 一、最终状态

| 卡 | 实施 | 独立复验 | 证据 |
|---|---|---|---|
| K00 暂停消息顺序与等待预算 | Codex | 修正后探针 18/18 | `independent-probes.json`;bg 级 |
| K01 后台确认与续轮最新结果 | Codex | 修正后探针 6/6 + ext | 含同字段双控件；`manual-handoff-e2e`(含 `--reject-resume`) |
| K02 旧诊断身份与时间边界 | Codex | DS 探针 6/6 | unit + bg |
| K03 测试可信度 | Codex | 当前态复核 | 消息属性修正、变异锚点唯一命中、负向业务断言 |
| K04 交接复核 | DS + Codex 收口 | — | 当前 135 文件冻结哈希 + 全主门禁 + 4 负向 + 探针 30/30 |

## 二、DS v8 复审反例(E01–E08)关闭情况

| 编号 | 问题 | 状态 | 复验方式 |
|---|---|---|---|
| E01 暂停/恢复乱序 | seq 严格递增;缺失/Infinity/旧序号拒绝 | 关闭 | 探针(含 RESUME 姊妹消息) |
| E02 暂停期间新 frame 加入 | 注册后重算等待策略 | 关闭 | 探针(有效定时器计数) |
| E03 暂停预算到期 | 去重计数 + 保留快照 + STOP 带 docId | 关闭 | 探针(到期 payload) |
| E04 旧成功掩盖新失败 | 新快照优先 | 关闭 | 探针(真实合并函数) |
| E05 旧 runId 原文 | 旧标识重编码 | 关闭 | 探针 |
| E06 未来时间 | 未来/负时间/倒置拒绝 | 关闭 | 探针 |
| E07 旧广播失败污染新轮 | 异常只作用于自身 run | 关闭 | 修正后探针(bg，等待旧异常实际落地后再收口新轮) |
| E08 未确认就续填 | 等 FILL_RESUME 确认;拒绝即停 | 关闭 | ext `--reject-resume` |

## 三、证明层级边界(不夸大)

| 层级 | 内容 |
|---|---|
| unit | 依赖图、值语义、合并、会话/路由、脱敏与迁移、生命周期纯逻辑 |
| bg(真实 background VM) | 乱序/重复 seq、注册封口与晚注册回执、终态类别、deadline 停止通知、暂停/恢复顺序与预算切换、旧广播异常隔离 |
| driver(真实浏览器 + 合成 DOM 协议) | component ant/select2/element/layui ×3、date ×5、blue-flat ×3、widget ×2 = 22 |
| ext(真实扩展 + 本地夹具/测试专用构建) | 合工大三联、北科 14 行、LZU 合同清空/恢复、React/Vue、8 项依赖、H01 首项、H03 两 frame、H04 换档案、I02 脱敏、J00 取消提示、J00 deadline 停止、J01 人工续轮、J01 拒绝恢复 |
| **未覆盖** | 真实高校站点与账号(liveVerified=false)、真实第三方框架安装、远端 CI |

## 四、最终门禁(2026-09-11 复核实测)

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
| `node test/deadline-stop-e2e.mjs` | 0 |
| `node test/manual-handoff-e2e.mjs` / `--reject-resume` | 0 / 0 |
| `--negative-sync` / `--ignore-cancellation` / `--ignore-deadline-stop` / `--ignore-resume` | 1 / 1 / 1 / 1(预期) |
| 135 个源码/测试源/构建配置文件冻结校验 | 门禁前后 SHA-256 均为 `F0DEF0373EFB8C7CC3FEB9729280D92C022221CE163244955F6F182212E396B8`，changed=0 |
| `node tools/verify-v9-hashes.cjs` | 0（旧 v9 基线 + 九项后续覆盖，共 135/135；其中五项为 v2.0.6 版本/证据/格式整理） |
| `git diff --check` | 0 |

## 五、保留边界

- DS 复核期间的并发进程已经结束；当前态已在单一串行进程中冻结复跑，不再有“需等待另一会话”的待办。
- `liveVerified=false`;远端 CI 未运行;未提交、未 push。
- 上一轮工具残留 `test/.v9-tmp-bundle.cjs`、`test/.v9-tmp-run.mjs` 按用户边界保留，未删除。
- 四条负向自检现均以目标业务断言退出 1。

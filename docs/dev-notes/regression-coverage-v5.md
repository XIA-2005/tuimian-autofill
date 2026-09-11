# v5 覆盖矩阵(G00–G09 · 2026-09-10)

> **历史文档(2026-09-10 起)**:v5 阶段矩阵,已由 `regression-coverage-v6.md` 取代,不再作为当前结论。

> 每条 = 编号 → 测试名称/位置 → 生产入口 → 证明层级 → 最新结果。
> 证明层级:unit=纯单测;contract=真实生产模块(整链/契约);ext=真实打包扩展浏览器断言;bg=真实 background 入口。
> 源码哈希(本轮快照,前 16 位):fill-pipeline aed0f27e5c28836c / control-drivers 6e758d5e43b284f6 / filler 7b2926d17dd747dd / fill-session 3b4192828d2343b8 / fill-task 0b28a0b647940b84 / background b1cd33bbf50de3ee / aggregation b13248a9c3c92fc3 / content 4e66d68a5989fd79 / check-adapters 8153b36d52af828d。
> live 验收:全部 liveVerified=false(未访问真实高校认证站点)。

## 一、v5 审查反例 V01–V07(全部关闭)

| 编号 | 期望 | 测试 | 生产入口 | 层级 | 结果 |
|---|---|---|---|---|---|
| V01 | 唯一目标/唯一 outcome/total=1/有所有权/可清除 | v5-audit.test「V01」4 项 | runFillPipeline → fillAll 检测期排除 + registerWriteOwnership + clearPageFill | contract | 通过 |
| V02 | 歧义候选整链不写 | v5-audit.test「V02」 | resolveContractControl.candidates → buildClaimedTargets → fillAll 排除 | contract | 通过 |
| V03 | select 已有值不被 school-picker 绕过 | v5-audit.test「V03」 | guardExistingScalar(按控件类型) | contract | 通过 |
| V04 | 父未成功时子不写(空/冲突) | v5-audit.test「V04-empty/conflict」+ run-e2e「G07a」 | markBlocked 全分支 + blockedDependents + LZU dependsOn | contract + ext | 通过 |
| V05 | 无所有权不恢复 | v5-audit.test「V05」 | conditionalRestore(需 writeRecord) | contract | 通过 |
| V06 | 旧回调不得在 B 轮获准 | v5-audit.test「V06」3 项 | fill-session.isRunStillActive | unit | 通过 |
| V07 | 无终态不算完成 / DTO 不转发私密 | v5-audit.test「V07」2 项(vm 加载真实 background) | background FILL_REGISTER/TERMINAL + sanitizeItems | bg | 通过 |

## 二、v5 G 卡验收

| 卡 | 强制验收 | 测试/证据 | 层级 | 结果 |
|---|---|---|---|---|
| G00 | 反例冻结 + 基线 + 负向自检 | v5-audit.test(13 项基线失败→逐卡转绿);TUIMIAN_NEGATIVE_SELFCHECK=1 → 退出 1 | unit | 通过 |
| G01 | 合同缺失可见失败/歧义阻塞独立字段照常/radio 不串组 | v5-audit「G01」3 项 | contract | 通过 |
| G02 | 用户干预后同值不误清/原有同值不授予所有权/驱动三联 | v5-audit「G02」6 项 | contract | 通过 |
| G03 | 合同路径清空 → 最终 failed;多选择器归因 | run-e2e LZU 夹具 + task-executor.test | ext + unit | 通过 |
| G04 | 档案修订后旧轮不冒充新轮;路由不落盘令牌 | run-e2e「G04」+ fill-session.test | ext + unit | 通过 |
| G05 | 参与者终态协议/拒绝无作用域消息/DTO 双向白名单 | aggregation.test(6 组)+ v5-audit V07 | unit + bg | 通过 |
| G06 | 真实恢复(值正确但报关联错误→恢复写前空值);变异负向 | run-e2e LZU zjhm 时间线 + 变异注入(退出 1) | ext | 通过 |
| G07a | 依赖阻塞(契约级 + 浏览器级父失败) | v5-audit V04 + 父同值放行 + run-e2e LZU rxnf | contract + ext | **部分**(异步延迟替换夹具未建) |
| G07b | picker 角色优先判定/删除无证据自愈 | content 角色化判定 + 既有合工大/北科 E2E | ext | 通过 |
| G08 | 完整合同证据 + 六项篡改拒绝 + 精确断言 | check-adapters(6 篡改均 exit=1)+ playwright.mjs 精确年月/零事件 | unit + ext | 通过 |
| G09 | 报告/CI/矩阵 | 本矩阵 + offline-gates.yml(未在 CI 运行) | — | 通过 |

## 三、v3 R / v4 Q 未取消项(回归)

| 编号 | 机制 | 测试 | 结果 |
|---|---|---|---|
| R02 | 合同外既有可填字段照常 | run.ts basic-safety(13 mustWrite)+ run-e2e mustWrite 8 | 通过 |
| R03/R04 | 同值零事件 / 异值保留 | run.ts same-value-noop / existing-value-conflict + 语义页 ext | 通过 |
| R05/R21 | 占位/前导零/日期精度;禁身份证推断/禁静默截断 | value-semantics.test + npm 断言 | 通过 |
| R06/R07 | 包排名/歧义;radio 组与多载体 | task-compiler.test + control-drivers.test | 通过 |
| R10/R11/R12 | 旧轮/旧 seq/零回报;frame 隔离 | aggregation.test | 通过 |
| R13 | 即时值稍后清空 → failed | run-e2e /clears + React/Vue 夹具 | 通过 |
| R14/R15 | 用户编辑保留;validation 不误判 | run.ts + recover 夹具 + task-executor.test | 通过 |
| R16/R18/R19 | 合工大三联/北科 14 行/半填行 | test:e2e | 通过 |
| R17/R23 | picker 人工接管;锁定档案/清除所有权 | picker-handoff.test + run.ts | 通过 |
| R24 | 密码/验证码/按钮零副作用;网络门禁 | run.ts + run-e2e(0 未知请求) | 通过 |
| Q01–Q10 | 见 v4 矩阵(继续有效) | contract-guard / 语义页 / fill-session / task-executor | 通过 |
| Q11/Q12 | 静默写捕获 / 防提交哨兵 | observer 自校验 + 负向注入退出 1 | 通过 |
| Q13 | 终态协议 / DTO 脱敏 | aggregation.test + v5-audit V07 | 通过 |

## 四、最终门禁(2026-09-10 凌晨,逐条实测)

| 命令 | 退出码 |
|---|---|
| npm run typecheck | 0 |
| npm test | 0(v5-audit 全绿) |
| npm run check:adapters | 0(六项篡改分别 exit=1) |
| npm run test:regression | 0(HARD 58 / FAIL 0) |
| PW_HEADLESS=1 npm run test:e2e | 0(含 G08 精确断言) |
| PW_HEADLESS=1 npm run test:regression:e2e | 0(8 PASS,含 G03/G04/G06/G07a) |
| git diff --check | 0 |
| 负向:TUIMIAN_NEGATIVE_SELFCHECK=1 | 1 |
| 负向:conditionalRestore 变异禁用 | 1(run-e2e 失败) |

## 五、明确保留(不静默)

- **G07a 为 in_progress**:"父选择后延迟替换子控件"的异步合成夹具、"父延迟成功后才写子"浏览器级断言、"取消/替换停止"依赖场景断言未建(其余依赖行为已覆盖)。
- `liveVerified=false`:未访问真实高校认证站点、未读 Cookie、未用真实账号。
- `.github/workflows/offline-gates.yml` 未在真实 CI 运行。
- 远端仓库未 push(用户未授权发布)。

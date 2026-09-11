# v4 覆盖矩阵(F00–F10 完成态 · 2026-09-09)

> 每条 = 反例/机制 → 测试文件与用例 → 生产入口 → 最新结果。结果口径:hard=自动化硬断言;ext=真实打包扩展浏览器断言;unit=纯单测。
> 门禁命令(全部无网络;最近一轮实测退出码见文末):typecheck / npm test / check:adapters / test:regression / test:e2e / test:regression:e2e / git diff --check。
> live 验收:全部 `liveVerified=false`(未访问真实高校认证站点)。

## 一、审查反例 Q01–Q13

| 编号 | 期望 | 测试位置 | 生产入口 | 结果 |
|---|---|---|---|---|
| Q01 | 合同字段已有不同值保留;一个目标一个结果 | src/core/control-drivers.test.ts(contract-guard);test/regression/run-e2e.ts 语义页 | fillAdapterContract.guardExistingScalar;filler.fillAll | hard + ext |
| Q02 | 同值零写入零事件 | 同上 + test/regression/run.ts(same-value-noop 场景 1) | 同上 | hard + ext |
| Q03 | 重复 ID 歧义不写 | control-drivers.test.ts(F01 用例,真实 fillAdapterContract) | resolveContractControl | hard |
| Q04 | 原生日期不同值不覆盖 | control-drivers.test.ts + 语义页(date) | guardExistingScalar(日期精度比较) | hard + ext |
| Q05 | 单选已选不同值不覆盖 | control-drivers.test.ts(radio)+ 语义页 | guardExistingScalar(radio 整组) | hard + ext |
| Q06 | 重复填充不破坏清除所有权 | run.ts runRepeatFillOwnership(场景 A/B) | filler.clearPageFill(所有权记录驱动) | hard |
| Q07 | 脱离文档节点不恢复 | run.ts same-value-noop(P07 场景)+ test/fixtures/recover-semantics.html ext | filler.conditionalRestore(isConnected/ownerDocument) | hard + ext |
| Q08 | 旧 Document 快照不可用于新 Document | src/core/fill-session.test.ts | fill-session.documentIdentity + captureRunSnapshot | unit |
| Q09 | hash 页面区分;持久化不带令牌 | fill-session.test.ts | fill-task.routeKeyFor(hash 摘要/去 query) | unit |
| Q10 | 他字段错误不归因本字段 | src/core/task-executor.test.ts(无关联不归因) | task-executor.attributableValidationError + content settle 接线 | unit |
| Q11 | 静默写→改回被捕获 | test/regression/observer.ts setter 写日志;run.ts 自校验 | 观测器(测试基建) | hard |
| Q12 | 防提交哨兵捕获故意点击 | run.ts 自校验(btnNext.click);run-e2e.ts __obsInstalled 断言 | 观测器 + e2e 委托监听 | hard + ext |
| Q13 | 终态协议;拒绝无作用域消息;DTO 脱敏 | src/background/aggregation.test.ts;fill-session.test(DTO 白名单) | background/index.ts(拒绝缺 runId/frameSeq、RunAggregator);fill-task.toPlainFillItem | unit + ext |

## 二、v3 回归矩阵 R01–R24

| 编号 | 机制 | 测试位置 | 结果 |
|---|---|---|---|
| R01 | 契约与通用指向同控件,主写入一次 | control-drivers.test + fill-merge.test(认领集合/去重) | hard |
| R02 | 合同外既有可填字段照常写对 | run.ts basic-safety(13 mustWrite)+ run-e2e mustWrite 8 | hard + ext |
| R03 | 原值相同不 setter/click | run.ts same-value-noop 场景 1(零事件) | hard |
| R04 | 原值不同保留 + 独立字段继续 | run.ts existing-value-conflict + 语义页 | hard + ext |
| R05 | select 占位/零值/前导零 | value-semantics.test | unit |
| R06 | 重复 id/同分 page/无关 host 加分 | task-compiler.test(包评分/歧义) | unit |
| R07 | radio 组/多载体 | task-compiler.test + control-drivers.test | unit |
| R08 | 扩展 UI/加行/弹窗不误判漂移 | fill-session.test(routeKey);F04 实例身份 | unit |
| R09 | await 中同 id 替换/导航 | content runStillActive 守卫(各恢复点);F04 快照校验 | 代码级 + ext 冒烟 |
| R10 | 连点新一轮/迟到旧 frame 消息 | aggregation.test(旧 runId/旧 seq 拒绝) | unit |
| R11 | 写入超 1200ms/frame 不返回 | aggregation.test(timedOut 不伪装成功);content FILL_DONE timedOut 提示 | unit + ext |
| R12 | iframe 同 id/跨 realm | aggregation 按 frameId 隔离;observer 按文档实例隔离 | unit |
| R13 | 即时有值稍后清空 | run-e2e /clears(200ms 清空→failed 不标 filled);React/Vue 夹具(300ms 重置) | ext |
| R14 | settle 期间用户编辑保留 | run.ts same-value-noop 场景 2;recover 夹具(来源不明不恢复) | hard + ext |
| R15 | validation 空/隐藏/旧/他字段错误不误判 | task-executor.test(三场景 + 无关联);生产 settle 归因接线 | unit |
| R16 | blue-flat/minimal picker 精确成对 | test:e2e 合工大三联断言(10700/080301 三值) | ext |
| R17 | 人工接管/跳过/重试 | picker-handoff.test(jsdom 8 用例) | unit |
| R18 | 北科 14 条成果 | test:e2e(rows=14/nonEmpty=14/nextClicked=null) | ext |
| R19 | 半填行/新增失败/对话框 | 既有动态表 jsdom 用例(npm test) | unit |
| R20 | 依赖失败仅阻塞依赖者;环拒绝 | control-drivers.test(F08b 契约级)+ dependency.test | hard |
| R21 | 地区推断/超限/括号 | filler 移除身份证推断;超限跳过断言;standard-code-catalog 去括号删除 | hard |
| R22 | namespace/近名/K-T 后缀 | contract 成对角色守卫 + e2e 三联;catalog 保留 K/T | hard + ext |
| R23 | 锁定档案/导入导出/清除所有权 | run.ts(R23 锁定可填 + 清除三场景) | hard |
| R24 | 上传/登录/提交/外网/敏感日志 | run.ts(pwd/yzm 零事件、按钮零点击)+ run-e2e 网络门禁 0 外联 | hard + ext |

## 三、v4 F 卡专属验收

| 卡 | 强制验收 | 证据 |
|---|---|---|
| F00 | Q11 静默写捕获、Q12 故意点击捕获、同名元素留痕、负向自检非零退出 | run.ts 自校验 + TUIMIAN_NEGATIVE_SELFCHECK=1 → 退出 1 |
| F01 | 重复 id 双不写、唯一目标仍写、radio 不误阻塞、页/包歧义拒绝 | control-drivers.test + task-compiler.test |
| F02 | Q01/Q02/Q04/Q05 浏览器形态 + 长文保护 | run-e2e 语义页 + filler-essay.test |
| F03 | Q06 所有权跨轮延续、用户后改保留 | run.ts runRepeatFillOwnership |
| F04 | Q08/Q09 + packageVersion 作用域 | fill-session.test |
| F05 | 拒绝无作用域消息、DTO 白名单、FILL_DONE 作用域 | aggregation.test + fill-session.test + run-e2e |
| F06 | 200ms 清空/框架重置/框架拒绝/对照组 + 归因 | run-e2e /clears + react-controlled + vue-controlled;task-executor.test |
| F07 | 不可恢复不覆盖、可恢复不残留、零提交 | run-e2e /recover-semantics + run.ts Q07 |
| F08 | 成对角色、依赖拓扑/阻塞/环、诱饵收口 | picker-state-machine.test + control-drivers.test + dependency.test |
| F09 | 真实包试点 shouldWrite/mustPreserve + 证据严格校验 + 篡改负向 | test/evidence/pilot-ustb-education.json;test:e2e F09 断言;check:adapters(篡改退出 1) |
| F10 | 终态分区定义、证据有效期、CI、矩阵 | fill-telemetry 注释;content TABLE_EVIDENCE_TTL_MS;.github/workflows/offline-gates.yml(未在 CI 运行);本矩阵 |

## 四、最终门禁(2026-09-09 晚,逐条执行)

| 命令 | 退出码 |
|---|---|
| npm run typecheck | 0 |
| npm test | 0 |
| npm run check:adapters | 0 |
| npm run test:regression | 0(HARD 58 / FAIL 0;DEFECT 0) |
| PW_HEADLESS=1 npm run test:e2e | 0 |
| PW_HEADLESS=1 npm run test:regression:e2e | 0(F06×2 + F07 + mustWrite + 网络门禁) |
| git diff --check | 0 |
| 负向:TUIMIAN_NEGATIVE_SELFCHECK=1 npm run test:regression | 1(检测器真实生效) |
| 负向:check:adapters 篡改(live 无 reviewer / 不存在 pageId / 不存在字段) | 1 |

## 五、明确保留(live / 未完成)

- `liveVerified=false`:未访问真实高校认证站点,无真实账号验收。
- 省→市→区浏览器级级联夹具未建(依赖声明与阻塞已在契约层验证)。
- CI workflow 未在真实 CI 运行(本地编写,标注未验证)。

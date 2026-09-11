# 回归覆盖矩阵 R01–R24(PLAN v3 · P01 产物)

> 每个机制必须有实际断言;断言位置与接管任务卡如下。hard=当前即通过;defect=红项已登记,由 ownerTask 卡实现后转 hard。
> jsdom 样本均标注 `jsdomVisibleShim`(可见性打桩,不能证明真实页面可见性);真实框架行为只在浏览器夹具断言后声明。

## 已落地的断言样本(P01)

| 样本 | 类型 | 断言内容 | 结果 |
| --- | --- | --- | --- |
| basic-safety | behavioral-fixture(jsdom + E2E 双跑) | 13 项 mustWrite 全对、保留 token/keepX、pwd/yzm 空且零事件、3 个敏感按钮零点击、锁定档案可用于填网页、无声明外控件写入 | hard ✅(E2E 8 项 mustWrite + 同套安全断言) |
| existing-value-conflict | behavioral-fixture(jsdom) | R04 已有不同值保留(今日覆盖→defect)、语义诱饵"本人联系电话(导师)"(今日误填→defect)、无规则字段不被碰 | defect ×4(P04/P02 接管) |
| same-value-noop | behavioral-fixture(jsdom) | R03 相同值零事件(今日 2 事件→defect)、清除所有权保留用户后改值(今日被清→defect)、无规则字段清除后保留 | defect ×4(P04 接管)+ hard ✅ |
| static-nwpu-sanitized | static-snapshot(jsdom 文件扫描) | 脱敏哨兵、无身份证/手机/邮箱模式、无远程引用;不执行填充 | hard ✅ |
| 自校验 | runner 内建 | 观测器能捕获"写入后又改回"(4 次事件)并确认最终值还原 | hard ✅ |
| 网络隔离门禁 | run-e2e 内建 | 夹具外 http(s) 请求 0 次(扩展自身资源放行) | hard ✅ |

## R01–R24 逐项状态

| ID | 场景 | 断言位置 | 现状 | 接管任务 |
| --- | --- | --- | --- | --- |
| R01 | 契约与通用指向同控件,主写入一次 | 待建(需 content 合并层可测入口) | not-implemented | P03(现 E2E 北科/合工大作行为基线) |
| R02 | 合同外既有可填字段照常写对 | basic-safety mustWrite(13/13) | hard ✅ | — |
| R03 | 原值与目标相同 → 不 setter/click | same-value-noop 事件计数 | defect(2 事件/字段) | P04 |
| R04 | 原值不同 → 保留 + conflict + 独立字段继续 | existing-value-conflict | defect(覆盖发生) | P04 |
| R05 | select 占位/零值/前导零代码 | basic-safety 占位 select 可写 | 部分 hard ✅(占位);零值/前导零样本缺失 | P04 补样本 |
| R06 | 重复 id/同分 page/无关 host 加分 | 待建(需只读候选 API) | not-implemented | P02 |
| R07 | radio 组/多载体逻辑目标 | 待建 | not-implemented | P02 |
| R08 | 扩展 UI/加行/弹窗不误判漂移 | 待建 | not-implemented | P02/P05(基线事实见 baseline-2026-09 §7.2) |
| R09 | await 中同 id 替换/导航 | 待建(浏览器) | not-implemented | P05 |
| R10 | 连点新一轮/迟到旧 frame 消息 | 待建(扩展层) | not-implemented | P05 |
| R11 | 写入超 1200ms/frame 不返回 | 待建(扩展层) | not-implemented | P05 |
| R12 | iframe 同 id/跨 realm | 待建(扩展层) | not-implemented | P05 |
| R13 | 即时有值稍后清空 → 稳定回读失败 | 待建(浏览器) | not-implemented | P06 |
| R14 | settle 期间用户编辑保留 | 待建(浏览器;jsdom 侧近似:same-value-noop 清除场景) | defect 部分 | P07 |
| R15 | validation 空/隐藏/旧/他字段错误不归因 | 待建(浏览器) | not-implemented | P06 |
| R16 | blue-flat/minimal picker 精确成对 | 现有 E2E(北科/合工大)保持基线 | hard ✅(基线) | P08 加近似选项负例 |
| R17 | 人工接管/跳过/新一轮重试 | 现有 jsdom picker-handoff 测试保持 | hard ✅(基线) | P08 |
| R18 | 北科 14 条成果 | 既有 E2E(rows=14/nonEmpty=14/nextClicked=null) | hard ✅ | — |
| R19 | 半填行/新增失败/编辑对话框 | 既有动态表 jsdom 用例保持 | hard ✅(基线) | P09 |
| R20 | 父选项延迟/父冲突/依赖环 | 待建(级联样本) | not-implemented | P09 |
| R21 | 地区推断/超限值/括号名称 | 待建(边界样本) | not-implemented | P10a |
| R22 | namespace 错/近名/K-T 后缀 | 待建;契约 code/name 回读有现有用例 | 基线部分 | P10b |
| R23 | 锁定档案/导入导出/清除所有权 | basic-safety(R23 锁定可填 ✅);same-value-noop(清除所有权 defect);既有档案 round-trip 用例 | 部分 defect | P04 |
| R24 | 上传/登录/提交/外网/敏感日志 | basic-safety + run-e2e 网络门禁 + 既有 E2E 日志脱敏 | hard ✅ | 各卡持续回归 |

## 缺口登记(显式,不允许静默消失)

- R01/R06/R07/R08/R09/R10/R11/R12/R13/R15/R20/R21/R22 的断言入口在对应任务卡内创建;创建前这些行保持 not-implemented,不算通过,也不算回归失败(见 PLAN §2.4 分阶段门禁)。
- jsdom 可见性 shim 覆盖的样本:basic-safety / existing-value-conflict / same-value-noop(不影响其"值/事件/点击"类断言;真实可见性类断言只在浏览器夹具)。
- 静态快照只作结构/脱敏基线,不得用作"该页可填写"或"组件支持"证据。

## P01–P12 终态增补(2026-09-09)

- R03/R04/R23 已于 P04 转 hard(回归 same-value-noop / existing-value-conflict,46+ hard 断言);R05 占位/'0'/前导零经 value-semantics 单测 hard;R10/R11 经 RunAggregator 单测 hard;R13 经稳定校正(末轮)+ stableReadback 单测;R15 归因单测;R21 地区推断禁用+超限不裁断 npm 断言;R22 沿用既有 code/name 守卫与 e2e。
- 仍显式 pending(不静默):语义诱饵(导师电话)defect 1 项;真实 React/Vue 浏览器夹具(R13/R14/R15 浏览器形态);真实高校 live 验收;dependsOn 声明式级联样例(区域三联已覆盖既有真实需求)。
- 新增门禁命令:npm run test:regression / test:regression:e2e / check:adapters(均无网络)。

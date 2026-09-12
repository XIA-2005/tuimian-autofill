# F02 · 已知缺口红相位登记（正确率 gaps → 目标行为断言）

- 依据：任务书 v10.5 §3 F02（登记纪律：**红相位写目标绿行为，禁固化现状**；F01 门禁对"清单内已知红"按登记放行；每条标翻绿卡号）。
- 行格式：`[ID] 目标行为断言名 :: 当前行为证据 :: 翻绿卡号 :: 作者/复核`。
- 断言的可重跑载体：`node test/bench/run.mjs --oracle docs/analysis/v10-review-2026-09-11/oracle-F01.signed.json`（真实已签 oracle 路径四分类，红相位素材输出，P7 缺陷键显形）。**翻绿判定=对应键从缺陷清单消失且四元组对应桶归零**； oracle 草案变更须审查者重签（invalidatesOn 条款）。
- 作者：QWEN（执行者）｜复核：DeepSeek（待本轮判定）。

## 第一优先：日期族系统性 missing（R3+R4 共同靶）

**[F02-D1] 生日/入学/毕业年月在三夹具被完整填写 :: 实测三独立夹具重复出现 missing：`missing:csrq`(wisedu-generic)、`missing:rxny,byny`(blue)、`missing:txtCsrq,txtRxny,txtByny`(retro)——`node test/bench/run.mjs --oracle docs/analysis/v10-review-2026-09-11/oracle-F01.signed.json` 输出"缺陷键"节，2026-09-12 批实测 :: R3（写前格式适配：日期形状换形）+ R4（回读多形状重试：YYYYMMDD/YYYY-MM-DD/YYYYMM/YYYY-MM 依次重试） :: QWEN/待 DeepSeek**

## R 系列（正确率）

- **[F02-R1] 事件派发按字段风险分级收敛 :: 现状 6 套互斥事件集无选级（`filler.ts:132-138` 四事件、`control-drivers.ts:33-37` 三事件、select 两件）——证据沿用竞品差距文档 R1 行实测行号 :: A1 :: QWEN/待 DeepSeek**
- **[F02-R2] 写入窗口内真实回发=0 且窗口后引用原值 :: 现状仅被动 `postbackJustFired`（`dynamic-table.ts:85`），无 MAIN 抑制窗口/配对还原 :: A2b（前置 A2a 诊断） :: QWEN/待 DeepSeek**
- **[F02-R3] maxlength/页面校验证据驱动值换形且超长不裁剪（E1206） :: 现状仅 placeholder 推断+长度上限，写错形状靠回读发现；日期族 F02-D1 为其红证据 :: A3 :: QWEN/待 DeepSeek**
- **[F02-R4] 回读不符按多形状重试且封顶 4 次 :: 现状单形状不符即 failed（350ms 自愈+9 格式白名单但单形状）；日期族 F02-D1 为其红证据 :: A4（依赖 A1 事件层） :: QWEN/待 DeepSeek**
- **[F02-R5] 手机槽禁回落固话、身份证槽禁跨字段取值 :: 现状 `VALUE_ALIASES` ~17 键、negative 词表可被邻槽抢填（竞品 237 ALIAS 反例对照在竞品差距文档 R5 行） :: A5 :: QWEN/待 DeepSeek**
- **[F02-R6] 关系词/角色词整行拒写且带理由（拒填可解释，非静默跳过） :: 现状 label+黑名单选择器，无字段级角色语义层（竞品 fill_role 4 值+14 关系词对照） :: A6 :: QWEN/待 DeepSeek**
- **[F02-R7] 院校/专业码表全量（2636/1250）且名称→码经页面选项消歧 :: 现状 45/35（`standard-code-catalog.ts` 实测），区划树 31 省 vs 码表 34 省口径不一致 :: A7（数据源锁 RD-A7 + RD-A7b） :: QWEN/待 DeepSeek**

## S 系列（范围/收口）

- **[F02-S1] 同意/承诺类 checkbox 进报告并可执行（冻结词表）或 skipped 人工、禁 failed 噪音 :: 现状 `filler.ts:321-323` checkbox 硬拒、不进 FillItem（机会缺口：竞品 checkbox_group 亦无通用派发） :: B1 :: QWEN/待 DeepSeek**
- **[F02-S2] Cascader forced 路径漏排 `.ant-cascader` 修复且 DOM 回读命中才算成功 :: 现状 `component-select-drivers.ts:90` 裸 `.ant-select` 必败 :: B2 :: QWEN/待 DeepSeek**
- **[F02-S3] 独立 contenteditable 进 FillItem/可报 noMatch/可高亮（先可见） :: 现状 `matcher.ts:618` 只扫 input/select/textarea——不填、不报、不高亮（"漏填不报"最大盲区）；oracle 折叠条 retro `editorEssay`(css 定位)已为其 oracle 侧占位锚（silent-no-write+deferredTo=B3） :: B3（前置 F05 清单） :: QWEN/待 DeepSeek**
- **[F02-S4] `date-range/kendo/aspnet` 三 driver 声明即 `check:adapters` 报错、运行时显式 E 码报错，禁静默降级 :: 现状 `adapters.ts:40/47/48`+`adapter-packages.ts:579` 白名单，全 src 3/4/3 refs 零合同使用（实测零使用故风险降级但收口成本极低） :: B4 :: QWEN/待 DeepSeek** —— **✅ 已翻绿（B4 收口，2026-09-12）：类型联合+schema 白名单双剔除；运行时守卫显式 `[E1301]` failed（issueCode 透传报告）；`check:adapters` 新增常驻负向用例（schema×3 拒绝 + 运行时 E1301 + 正向对照不误伤）全 PASS**

## 次优先红素材（F02-D1 之外的本批 bench 实测）

- **[F02-B1a] blue `wrong:sqyxmc`：apply.targetCollege（申请院系"精密仪器系"）写入值与期望字面不符——引擎对该控件的档案源路径/映射与 oracle 不一致，归 B2/B1 相邻链路排查（oracle profileSource.path=apply.targetCollege，bench 对齐表映射 applications[0].college；引擎实际取值路径待 A1 时以 eventPolicy 管线证据定位） :: B2 :: QWEN/待 DeepSeek**
- **[F02-B3a] generic `missing:bkbydwShow,bkbyzyShow`：picker 链路（弹窗选择）未产出写入——picker 字段在 jsdom 同步链不可驱动，属 B1/B2/A7 picker 消费面 :: A7/B2 :: QWEN/待 DeepSeek**

## 门禁放行约定

- `test:offline` 现不含红断言执行（红断言=登记+bench 素材输出；bench self-test 机制证明已入链）。翻绿卡完成时：该键断言转绿并由对应卡接入 `npm run bench` 断言面（`bench:oracle` 四元组对应桶归零为机械判据）。
- 清单外新红=F01 门禁失败（任务书 §3 F02 纪律）；D 阶段新发现回灌本表并立新卡（D3 纪律），不得就地修。

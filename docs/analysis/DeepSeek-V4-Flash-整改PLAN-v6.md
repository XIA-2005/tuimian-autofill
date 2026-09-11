# 整改 PLAN v6：接管 G07a 后的剩余任务

项目：`D:\deepseek-work\tuimian-autofill`。日期：2026-09-10。
执行前读取：`DS-v5复审与接管结果-2026-09-10.md`、`docs/dev-notes/codex-g07a-handoff-2026-09-10.md`、当前git diff。

## 0. 范围及不可回退项

Codex已接管G07a，新增生产异步依赖入口及八个浏览器场景。**不要删除或改回同步遍历，不要再把缺夹具当阻塞。** 普通字段、picker人工接管、合工大三联、北科14行、React/Vue和真实恢复测试必须继续通过。

本计划不授权真实高校登录/抓取、读取Cookie、自动保存/下一步/提交、自动push/发布。继续使用TypeScript/MV3；不改竞品，不清理用户未跟踪文件。代码函数和关键判定保留中文说明。

新建 `docs/dev-notes/implementation-progress-v6.md`；保留历次历史，只追加纠正。每卡passed必须绑定实际代码哈希、生产入口、测试命令/退出码、正负例及日志。文档中的“其余passed”不是证据；未满足强制项不得移成backlog。

依赖：`H00 → H01 → H02 → H03 → H04 → H05`。H00先把本次剩余反例变成硬断言；其余按顺序收口，持续本地执行，不逐卡询问。

## H00 冻结剩余反例和接管边界

文件：新账本、测试入口、覆盖矩阵。

- 保存本次接管后基线，区分用户/DS原改动与Codex新增改动，不回滚整文件。
- 将复审脚本中的首项覆盖、label重复ID、旧修订恢复、通信docId重用、注册集合提前完成转为自动断言。旧终态改变状态已修，保留新增aggregation单测即可。
- 脚本局部R01–R07不得与v3的R01–R24混淆；新矩阵使用“v6-Hxx-用例名”命名。
- 正式内容脚本含依赖页面必须使用runFillPipelineAsync。同步入口可供兼容测试/无依赖场景；明确禁止把它重新接回生产依赖页面，必要时同步入口遇依赖只编译/返回待异步处理，不得抢写。
- 复核新dependencyWait配置和有界取消测试，使用现有八场景；未知组件按明确证据扩充，不扩大自动写权限。

验收：剩余反例在未修代码上确实失败；新G07a正常通过；`--negative-sync`必须失败；没有以更新期望消除问题。

## H01 首项已有值保护与所有回退路径消歧

问题：当前把“无selected属性且selectedIndex=0”认作empty，但用户可以选择首个合法选项；label[for]和标签容器仍取首。

文件：`filler.ts existingValueDecision`、`control-drivers.ts guardExistingScalar/resolveContractControl`、相关测试。

实施：

1. 删除“首项等于空”的通用推断。空值只来自占位文本/空值规则或明确页面合同证据；真实有效首项必须进入同值/冲突判定。
2. 不把所有默认值一律停填：有真实占位的空select照常填写；若页面明确声明可替换系统默认值，需要有可验证来源及单独策略，不能仅看DOM属性。
3. label[for]查询所有同ID目标：一个才绑定，多个返回完整歧义候选集合并在整链禁止写入。标签容器多input/select不得querySelector取首。
4. radio按form/组身份消歧；无name的不同radio不能合成同一组。
5. 阻塞应精确作用于歧义节点；独立邮箱、电话等仍照常填写。

强制验收：首项合法值被用户选中后不同资料不覆盖；首项同值零setter/事件；占位首项正常填；label重复ID两个均零写；同标签多控件不猜；radio跨form不串组。至少一个真实扩展浏览器负例和正例，不能只测resolver。

## H02 写入记录绑定原轮、档案修订和输入类型

问题：writeRecords只有before/expected/after/driver/userIntervened，没有run/revision。提高档案修订后旧记录仍可授权恢复；register还会重置干预标志。

文件：`filler.ts WriteRecord/registerWriteOwnership/conditionalRestore/clearPageFill`、`fill-session.ts`、所有实际写入入口。

实施：

1. 写入记录包含文档实例、runId、档案及规则修订、目标/驱动身份。生产实际记录与比较，不只新增类型。
2. 恢复必须显式传原轮context，记录和当前轮一致才允许。资料变化、导航、取消后旧记录不得恢复。
3. 区分“清除扩展仍拥有的历史写入”与“失败恢复本轮写前值”。允许连续同值填写保留可清除所有权，但不能把旧before值当新轮恢复点。
4. 用户/来源不明干预一旦发生，旧记录不因再次mark或register自动恢复权限；新写入只能按新授权、新快照建立新记录。
5. driver='text'之外仍检查真实input.type；日期、radio、checkbox、文件、密码等不得仅因登记错误而被当文本恢复。
6. 所有权仅由真实写入建立，UI高亮不授予。组件/表格未迁移入口列具体清单，不写“全部完成”。

强制验收：复审旧revision恢复反例保留原值；旧run/新文档/用户后改不恢复；合法当前轮文本可实际恢复；关闭恢复逻辑时该测试必须失败；连续同值仍可清除扩展写入，页面原有值不可清。保留现有G06真实恢复浏览器用例。

## H03 frame注册封口、真实终态和文档通信身份

问题：当前第一帧终态就收口，尚未注册的帧被漏掉；15秒deadline早于15秒补填后的稳定验证；通信docId每个模块实例从doc1重新开始。

文件：`background/index.ts`、`aggregation.ts`、`fill-session.ts documentIdentity`、content FILL/FILL_DONE发送接收与统计。

实施：

1. 文档通信ID用每次内容脚本/Document实例的随机唯一值，不能用进程内递增数冒充跨导航身份。仍用WeakMap保证同实例稳定。
2. 定义参与者发现/注册窗口和封口条件。在明确封口前不得仅凭当前allTerminal完成；可以用content启动握手和广播完成确认，不默认扩大权限。
3. 无返回、晚注册、动态新frame的边界明确区分“未覆盖/本轮参与/下一轮”，并在UI可见。不要通过任意延长一个计时器伪造发现完成。
4. 终态必须在该帧所有应执行的依赖/picker/行任务和稳定验证结束后发送；取消/等待人工/超时是明确终态类别。禁止15秒回调一开始就发送成功终态。
5. deadline必须覆盖实际预算，超时时保留已报告字段及未终态参与者原因；不要把所有超时都写成“页面无响应”。
6. FILL_DONE拒绝缺run身份及旧轮消息。顶层展示真正跨frame汇总，而本地registry仍独立保存，不用顶层自己结果替代总结果。
7. 保留Codex修复：terminalize在accept失败时不改变terminal状态。旧seq/旧run两项硬断言不能删除。

强制验收：真实扩展至少两frame——顶层快速完成、子frame延迟注册/延迟成功超过1200ms；一个frame失败/超时；旧文档回报；乱序seq；取消；末轮写入后清空。断言汇总目标数和各状态准确、早收口不会发生。单测只证明聚合函数，不能替代这些浏览器场景。

## H04 所有异步driver的恢复点与稳定条件

问题：G03仍有“driver级未落地”的强制项，G04虽然传了ctx，部分await后的下一次副作用没有校验。G07a已补原生依赖，但不等于所有picker/动态行都完成。

文件：content picker/row函数、`filler.ts`相关异步driver、执行器、依赖执行器。

实施：

1. 列出每个await、then、timer以及恢复后的第一个write/click点；在真正副作用前校验捕获的ctx、目标连接和文档，而不只在外层入口检查。
2. 逐driver明确：写前权限、预期语义/原生表示、就绪条件、稳定预算、模型或代码名称回读、取消方式、不可恢复原因。
3. 保留Codex修正的合同原生expectedValue；日期格式和代码/名称不能重新直接字符串错比。未知模型不能因为可见值相同就宣称验证成功。
4. 执行中page/用户改值不能被重试覆盖；正确值＋新增关联错误仍失败。显式aria关联已有支持，进一步禁止用短id文本命中其他字段错误。
5. 声明式依赖中picker waiting不能放行子项；人工完成后在有效轮次重新验证并继续。新的异步执行器是复用入口，不再建第三套未使用的调度器。
6. 单轮多个补填阶段的pending验证不能被“只保留最新settleRun”覆盖丢失。

强制验收：真实picker/行任务await期间换档案、导航、替换目标后不再写；人工接管恢复合法子项；React/Vue拒绝/延迟接受均正确；北科14行不重复、合工大三联准确、半填行保留、无自动下一步。测试未做的driver不能宣称全覆盖。

## H05 报告内容脱敏、保存证据与最终矩阵

文件：DTO/telemetry/report、save-guard、check-adapters、CI与文档。

实施：

1. 白名单字段不等于内容已脱敏：label含家庭成员姓名、reason含页面资料/令牌时仍会传出。使用固定字段标签/issue code，允许的用户提示内容单独在本地内存生成。
2. 检查REPORT_RESULT、sessionStorage、运行日志，而不只FILL_RESULT。合成敏感标记放进label/reason/错误文本验证不外传、不落日志。
3. 保存证据绑定包/页面版本、具体表格身份及有效期；本轮只已有路由/时间的部分不得当完整验收。
4. 证据完整集合、版本、configHash和样本hash校验继续保留；对新增dependencyWait等配置变化也应使旧证据失效，不能只哈希无关字段。
5. 重写单一最终状态表，清理互相冲突的“全部passed”和后续in_progress解释；历史表标注历史，不再作为当前结论。
6. CI使用现有回归脚本即包含新依赖E2E；不得忘记测试专用契约只进临时构建。远端未跑就明确未跑，不自动push。

最终门禁：

```powershell
npm run typecheck
npm test
npm run check:adapters
npm run test:regression
$env:PW_HEADLESS = '1'
npm run test:e2e
npm run test:regression:e2e
git diff --check
```

独立定位可用`npm run test:dependency:e2e`。负向检验`node test/dependency-e2e.mjs --negative-sync`预期退出1；普通门禁不把预期失败混入正常通过。

完成定义：H00–H05强制项全部验证；旧正例无回归；本轮剩余反例关闭；liveVerified=false仍如实记录。任一强制项未满足，最终标题继续使用“整改未完成”，列具体卡号、失败反例和下一步，不以门禁全绿代替需求验收。

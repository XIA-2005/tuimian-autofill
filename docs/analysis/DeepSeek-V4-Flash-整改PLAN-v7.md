# 整改 PLAN v7：剩余运行生命周期与数据流收口

项目：`D:\deepseek-work\tuimian-autofill`。日期：2026-09-10。
先读：`DS-v6复审与直接修复报告-2026-09-10.md`和`docs/dev-notes/codex-v6-handoff-2026-09-10.md`。

## 0. 保留现有成果，停止重复造模块

本轮Codex已补：保存证据schema2、异步作用域隔离、组件/日期取消、精确跨frame汇总和17项浏览器driver测试。不要回退，不要重做已完成的G07a。现有首项/歧义/恢复/依赖/React-Vue/动态行正例继续有效。

新账本：`docs/dev-notes/implementation-progress-v7.md`。顺序I00→I01→I02→I03。每卡必须有具体生产入口、正负例、实际退出码、源码hash和剩余项；有强制项未完成不能写passed。

继续保留完整一键填充、picker人工接管、半填行保护和14行动态表。不访问真实账号站点、不读Cookie、不新增自动保存/下一步/最终提交、不修改竞品、不自动commit/push/发布、不删除用户未跟踪文件。

## I00 运行完成后晚注册与终态生命周期

问题：当前700ms窗口封口不等于发现了所有frame；finishAggregation删除pending后，FILL_REGISTER仍静默丢失。末轮固定时间发终态也不能替代所有工作结束。

文件：background/index.ts、aggregation.ts、content终态发送/接收、settle-registry及测试。

实施：

1. 明确定义注册窗口内、封口后未结束、结束后、旧run、导航后新文档五种消息处理。完成后晚注册至少得到明确“本轮未覆盖/需重试”结果并更新顶层可见状态；禁止无界保留DOM或资料。
2. 可保留有界的结束轮摘要/回执身份，但必须有TTL和容量限制。没有该轮权限的注册不能重开已取消轮，也不能混入新轮统计。
3. 对重复注册去重；late计数按新参与者而非消息次数。提示必须与是否参与统计一致。
4. 建立明确的frame工作集合：依赖、picker、行任务、日期/组件、settle全部pending归零后才done；等待人工、取消、超时各有终态类别。
5. 终态必须在该轮最后一次实际验证后发送；不能再用“15s+470ms”或“加长deadline”来代替工作集合。25s可保留作真正硬上限，但超时不是成功。
6. 已终态后收到更高seq结果，按明确定义处理；不要在聚合单测允许更新、而background早已删轮的两个语义间自相矛盾。
7. 保留本轮修复：完整汇总写展示/遥测、本地registry保留DOM、无runId完成消息拒绝、响应不覆盖边界说明。

强制验收：

- 复审C05：先完成→再注册的frame有可见回执/提示；重复晚注册不重复计数。
- 两frame实际扩展：顶层1项＋子frame4项，底层counts.total必须等于5，不能只用面板全文正则。
- 子frame在末轮后拒绝值、长时picker等待人工、取消、一个区域超时、旧文档迟到，各有准确终态和计数。
- background VM用例可以承担乱序/重复seq故障注入；同时保留真实浏览器多frame生命周期测试。禁止为了测试给正式扩展开放任意消息执行接口，可用临时测试构建。
- 移除终态前pending检查后，对应负向用例必须失败。

## I01 剩余driver取消边界与写入所有权清单

问题：本轮补了共享组件/日期，但BlueFlat、widget、通用树/选择窗口、动态表dialog/行内操作仍需逐恢复点验证。

文件：blue-flat-picker-driver.ts、filler.ts相关picker/helper、dynamic-table.ts、driver策略表与浏览器夹具。

实施：

1. 列出真实调用链，不以“pickSchool接收了isCancelled”替代内部pickBlueFlatIdentity已收到。每个子调用透传同一原轮谓词，每次await后下一次click/write前检查。
2. BlueFlat搜索、分类切换、结果点选、代码名称回填等待均可取消；不能在外层await返回后才发现已写错。
3. widget下拉与通用选择窗口/地区树不得在await后继续搜索、确认或写隐藏代码。原轮失效不做自动清空“自愈”。
4. 动态表matchExisting、加行等待、dialog填写、blob同步、行内commit等点分别列出。行内按钮若属于保存/落库而非真正新增空行，应遵守现有禁止自动保存边界，不能借名称“添加”自动扩大授权。
5. 表格/组件所有权记录逐入口列清单。写入scope只能覆盖同步实际写入；绝不能恢复到跨await全局beginWriteScope。异步子driver若不记录ownership，要明确恢复不可用而非伪造成功。
6. 保留run-B交错测试：旧A取消不会清除B的记录身份。新增必要的双轮/同文档交错场景，不只测试单次调用。

强制验收：

- 每个迁移族至少正常正例＋await中取消＋节点替换负例；优先复用现有真实扩展及测试专用构建。
- 新17项driver协议测试继续通过，并明确它们不等于安装真实Ant/Element框架的验证。
- BlueFlat/通用树取消后搜索/选择/代码回填均不再发生；动态表取消后不再增加或提交后续行。
- 北科14行、合工大三联、8项依赖、React/Vue、真实恢复保持通过。
- 去掉任一新增取消传递后，对应承重负例失败。

## I02 遥测、报告与持久化内容脱敏

问题：FILL消息白名单已经改善，但reduceFillTelemetry仍把任意reason文本写入本地状态；REPORT_RESULT也不是同一白名单路径。

文件：fill-telemetry.ts、fill-task.ts、content报告与持久化入口、background REPORT_RESULT、测试。

实施：

1. 枚举FILL_RESULT/FILL_TERMINAL/FILL_DONE、REPORT_RESULT、sessionStorage运行日志、错误事件等出口，说明每个字段的来源和允许内容。
2. 持久化原因使用固定模板/issueCode；页面错误原文若需要用户即时查看，只存在当前页内存UI，不进入可复制诊断日志或跨上下文消息。
3. 姓名、地址、论文标题、任意路径令牌不靠手机/邮箱正则就能识别，不能以截断字符串替代脱敏。固定字段标签不得回退到未经验证的任意field字符串。
4. 报告中有意包含资料的用户导出与“无资料诊断报告”必须明确定义；不在普通诊断里悄悄夹带profile或页面原文。
5. 保留足够诊断价值：状态、字段类别、行号、driver、scope摘要、issueCode和建议操作。不要把全部错误变成空字符串导致无法定位。

强制验收：将合成姓名、地址、标题、path/query token放入label/reason/页面错误容器，实际消息及sessionStorage诊断中都没有这些标记；页面即时提示仍可定位字段；固定失败原因仍足以满足现有“未稳定接受/需人工”验收。

复审C06必须成为硬断言。验证完整生产出口，不只验证toPlainFillItem一个helper。

## I03 证据归档、当前状态与最终门禁

文件：新账本/矩阵、README能力边界、测试脚本与CI、check-adapters。

实施：

- 保存证据schema2已经完成，只维护其回归：包版本、页面、契约、表格身份、30分钟TTL、未来时间、缺范围及坏计数拒绝。不得重新降级为仅kind+route。
- 证据hash绑定本轮实际源码/配置；scope配置变更后旧证据失效。不要将旧日志与新源码hash拼成“本轮实测”。
- 唯一当前状态表覆盖I00–I03；历史passed注明历史。明确哪些是模块单测、background入口VM、浏览器生产driver、完整扩展E2E、真实站点。
- CI继续调用现有脚本，test:regression:e2e已含依赖及driver测试；远端未运行如实说明，不自动push。

最终命令：

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

独立检查：`npm run test:drivers:e2e`、`npm run test:dependency:e2e`。

负向自检：`node test/driver-cancellation-e2e.mjs --ignore-cancellation`、`node test/dependency-e2e.mjs --negative-sync`均应退出1；变异只在测试输入/临时构建中，不改正式行为开关。

完成定义：I00–I03强制项全部满足，当前复审剩余C05/C06及未覆盖driver实际关闭，旧正例不退化。任一项未满足继续报告“整改未完成”，不能用“证明层级保留”掩盖尚未接线的实现。liveVerified=false、CI远端未跑和未发布状态单独列明。

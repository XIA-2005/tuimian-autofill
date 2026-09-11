# DeepSeek V4 Flash 实施 PLAN v3

项目：`D:\deepseek-work\tuimian-autofill`
编写日期：2026-09-09
基线参考：v2.0.5 / HEAD `97d78d3`，开始执行时重新检查。
关联文档：`任务书审查意见-2026-09-09.md`；原附件仅作历史背景，有冲突以本计划和用户后续指令为准。

## 0. 如何使用本计划

这是实施任务书，不是宣称已经完成的代码。为便于执行模型保持上下文，采用“小任务卡＋明确文件范围＋固定验收场景＋进度账本”。不依赖某个模型的工具、上下文长度或隐藏能力；不要求并行代理。

建议先把配套 `DeepSeek-执行启动提示词.md` 交给实施 AI，并让它读取本文件。一次工作单元只完成一张任务卡；验收通过、上下文足够时可以继续下一张，不必每一步要求用户重新确认。若换对话，从执行账本恢复，不能仅凭上一位 AI 的“完成”文字跳过验证。

本轮审查时已运行 typecheck，通过；其余实施基线测试由 P00 执行。当前统计为 73 个内置包、109 个页面，0 个页面配置非空 expectedFingerprints；根目录 32 个 HTML 文件。数量只是当时快照，不能写死进业务或测试。

### 产品目标，按优先级排列

1. 不写错、不覆盖用户已有不同值。
2. 保持完整一键填充：普通字段、支持的组件、学校/专业/地区弹窗、自动加行、断点与人工接管继续可用。
3. 相同目标不重复写；异步结果不会串到另一轮/另一个页面。
4. 成功有对应控件的回读证据；未完成有可执行的原因说明。
5. 在这些条件满足后，再扩大适配覆盖或优化体积。

**禁止用“大部分字段都停止自动填”换取错误率下降。** 回归同时考核应该写的字段确实写对和不该写的字段没有被修改。

### 本轮边界

- 不新增自动保存、自动下一步、最终提交、自动登录、自动注册、材料上传或外部 AI 请求。
- picker 的“选择某项/回填”与报名“最终提交”是不同操作；保留已支持的精确点选，不因按钮文字含“确定”就一刀切禁用。
- 保留现有 OCR 默认关闭与现有用户设置，不重做 OCR，不扩大权限/端点。
- 不重新加入安全辅助填写、兼容体检、整页兼容评分确认框。
- 不运行 `test:e2e:real`，不访问登录状态高校网站，不读取浏览器账号数据。确需真实页面验收时记录具体缺口；已有认证采集限制继续生效。
- 不修改竞品目录，不复制其业务实现进本项目；仅借鉴经过本项目验证的设计原则。
- 不删根目录快照、`.deploy*`、用户档案或未跟踪文件；不全量格式化、升级依赖、自动提交/发布。
- 新代码沿用 TypeScript/MV3；新增或修改函数使用驼峰命名，宏式常量全大写下划线，函数前写中文功能说明，关键比较/评分算法写中文规则说明。HAL/ARM 工具链不适用于这个浏览器扩展，不迁移技术栈。

## 1. 总体路线与交付批次

```text
P00 基线与执行账本
 → P01 本地回归样本及副作用观测
 → P02 纯候选解析、精确作用域和歧义语义
 → P03 契约/通用去重，补齐结果目标身份
 → P04 语义比较、已有值保护、清除所有权
 → P05 文档/轮次作用域、跨 frame 完成协议
 → P06 异步稳定回读与字段级错误归因
 → P07 驱动可恢复时的条件恢复
 → P08 picker 与人工接管接入
 → P09 动态表与依赖接入
 → P10 代码命名空间与数据语义修正
 → P11 完整合同页面试点与证据
 → P12 运行报告、保存证据作用域与最终门禁
```

每张卡必须以上游已验收结果为输入，不在 P03 提前搭完 P11 的大架构。

| 批次 | 完成范围 | 交付意义 | 是否可扩大自动填写范围 |
| --- | --- | --- | --- |
| A | P00–P04 | 有回归、避免重复写、已有值保护 | 否，保留既有覆盖 |
| B | P05–P10 | 异步、复杂控件、资料语义形成闭环 | 否，不顺带扩校 |
| C | P11–P12 | 完整页面试点、证据、报告及发布前回归 | 仅有证据的具体试点页面 |

若 P11 缺真实页面证据，可完成离线试点并保持生产策略不变；账本写明 live 验收未完成，不能伪造人工验收人。P12 的已授权离线工作仍可继续。

## 2. 工作纪律、证据和运行命令

### 2.1 进度账本

P00 创建 `docs/dev-notes/implementation-progress-v3.md`。每张卡按以下结构记录：

```text
Task: Pxx
Status: pending | in-progress | passed | blocked
Base: commit + 工作区差异摘要
Read: 实际阅读的入口/函数
Changed: 修改的文件与行为
Checks: 命令、时间、退出码、关键断言/报告路径
CoverageDelta: 应写且写对 / 实际越界修改 / 用户值保留 / 未覆盖机制
Remaining: 已知限制与是否为基线已有
Next: 下一卡编号及前置条件
```

“blocked”用于缺必要输入/环境/证据；不能为了赶进度把测试失败写成 passed。未运行的命令明确写未运行。基线失败要保留复现信息，不能删除测试或随意标记 skip。

### 2.2 当前已有命令

在项目根目录 PowerShell 执行，逐条检查退出码：

```powershell
git status --short
git rev-parse HEAD
node --version
npm --version
npm run typecheck
npm test
$env:PW_HEADLESS = '1'
npm run test:e2e
git diff --check
```

`npm test` 已执行 build；`npm run test:e2e` 也已执行 build。同一改动通过这两项后，无需再跑一次独立 build 来凑清单。若只改变构建/静态资源，单独 `npm run build` 是合理的专项检查。恢复原有 PW_HEADLESS 环境值，不改用户永久环境。

先检查 build.mjs 会重建 dist；若当前浏览器加载的扩展目录就是该 dist，P00 应在隔离工作树做测试，或使用已有可配置输出目录，不能在不知情时让用户使用中的扩展重建。隔离前确认 Git 状态，不能遗漏用户尚未提交的相关修改。

不要预设 Edge/Playwright 浏览器一定可用；启动失败属于环境未完成，不能当浏览器用例通过，也不能用 jsdom 结果替代。

### 2.3 待创建的测试入口

P01 完成前，下列命令不存在，不得记录为已运行：

- `npm run test:regression`：本地样本 runner，构建专用测试入口后执行；不依赖陈旧 dist。
- `npm run test:regression:e2e`：行为夹具与真实打包扩展测试，所有高校域名拦截到本地 fixture。
- P11 后可新增 `npm run check:adapters`：校验合同与证据引用，不执行网络请求。

优先复用现有 esbuild/jsdom/Playwright，不再引入测试框架。新 TS 测试位于 test 下，由 tsconfig 覆盖；每个新测试文件必须能被真实执行入口发现，不能只创建一个永不运行的 `.test.ts`。

### 2.4 检查节奏

- 单张卡：针对修改运行对应回归＋typecheck＋diff check；触及 DOM/消息/驱动时运行相关浏览器用例。
- 每个批次结束：完整 `npm test`、`test:regression`、现有 E2E、新增行为 E2E。
- 最终全量检查完成后，只在又有修改/失败/未解决问题时重复，不机械反复构建。
- 不强制红绿 TDD 仪式；测试必须覆盖可观察行为，不能照抄新函数内部实现作为期望值。

**分阶段门禁，避免循环依赖：** P01 的通过条件是 runner/观测器可信、基线完成记录，不要求尚未实施的冲突保护/稳定回读已经通过。把目标用例登记为 `baseline-defect` 或 `not-implemented`，默认基线报告显式显示这些项，不能算 passed；各任务卡接管对应 Rxx 后，其用例进入 hard gate，不得继续豁免。原有已通过行为始终是 hard gate。最终所有本轮宣称完成的行为必须全部进入 hard gate；缺真实网站证据只标 live pending，不影响离线已实现行为的硬验收。

**控制单次改动：** P05 可按“scope 与取消 → 消息去重 → 完成通知”拆三个顺序补丁；P08 按 picker 协议拆；P09 按表格模式拆；P10 已划分 a/b。每个补丁能单独检查，每张卡全部子补丁验收后才记 passed。不设机械行数上限，但不能把无关重构夹进当前卡。

## 3. 最小架构约定

### 3.1 不一次重写 fillAll

第一批先抽出“读取候选”和“执行单项”的最小可复用边界，保留 `fillAll` 的现有公开同步接口及既有调用者。普通字段迁移后再由内容入口使用异步执行器。不能一开始把 fillAll 改成 Promise，导致背景、UI、全部测试同时失效。

建议新增模块上限按阶段控制，不要求为了命名预建空文件：

| 模块 | 引入时机 | 职责 |
| --- | --- | --- |
| fill-task.ts | P02/P03 | 候选、逻辑目标、运行结果类型；不执行 DOM |
| task-compiler.ts | P02 | 只读候选→有来源的任务，不调用填写函数 |
| value-semantics.ts | P04 | emptiness/equality/冲突比较 |
| fill-session.ts | P05 | 轮次、文档代际、取消与目标登记 |
| task-executor.ts | P06 | 调用现有驱动、等待、回读、提交状态 |

代码需要更多模块时先说明具体职责重叠为何无法避免，不建立空转的多层 factory/registry 框架。

### 3.2 数据结构约定

以下是设计合同，不要求逐字复制伪类型：

```ts
type Outcome = 'pending' | 'written' | 'alreadyCorrect' | 'conflict'
  | 'blocked' | 'waitingUser' | 'failed' | 'cancelled';

type IssueScope = 'field' | 'dependency' | 'page' | 'run';

interface FillWriteItem {
  id: string;                 // 本轮唯一逻辑目标任务 ID
  targetRefId: string;        // 内存 registry 引用，绝不序列化 Element
  profilePath: string;
  authority: 'contract' | 'legacyRule'; // 每条任务的来源，不放在 task 顶层
  driverId: string;
  dependsOnIds: string[];
}

interface FillRunScope {
  runId: string;
  documentEpoch: string;
  routeKey: string;           // 脱敏逻辑页标识，不是 location.href
  packageId?: string;
  packageVersion?: string;
  pageId?: string;
  profileRevision: string;    // 运行内版本，不含资料
}
```

目标值与 before 快照放在不可序列化的运行内存中；对外 DTO 使用白名单字段构造，不能 `{...item}` 后再删少数字段。广播不得带 Element、原值、目标值、context 全量或原始 URL。

一个 logical target 可以有可见框、隐藏代码、展示框、radio group 多个节点。claim 的单位是逻辑目标及载体集合，不是 profilePath；同一 profilePath 在两个 frame 或两行出现，不一定是同一个目标。

### 3.3 执行权与覆盖

- 未迁移页：既有规则/既有驱动继续工作，加入目标去重、冲突保护与作用域校验；不设置全局 generic-safe 限制。
- 完整合同试点页：经 P11 指定 pageId 的完整合同决定可执行字段与表格。不得将其扩散到整校、整 family 或全部 verified。
- 已确认只读/上传/结果/登录区域：停止对应业务写入。没有匹配包、缺 fixture、缺 expectedFingerprint 本身，不构成停掉整页一键填充的理由。
- 明确合同目标漂移：停止这一专项目标及依赖项；只有页面身份本身不可信才停整页。更高可信合同明确冲突时，不能偷偷选择更弱通用规则绕过。
- contract 成功、等待 picker、冲突或明确 blocked 的目标都保留所有权，不能让 generic 接着覆盖；尚未绑定到目标的候选不能凭 profilePath 排除整页其他独立目标。
- 普通字段歧义只阻断该字段；父字段失败只阻断依赖子树，独立姓名/联系方式仍可填写。

### 3.4 成功语义

`written` 表示已执行且通过该驱动约定的 DOM/模型稳定回读；`alreadyCorrect` 表示用户原值等价，未调用 setter/click；两者不混作本轮写入计数。没有服务器保存证据时，不能显示“已经保存成功”。

`waitingUser` 不是成功，也不是运行崩溃；进度必须显示待人工，不能长期锁死一键按钮。用户本轮跳过后延迟补填不得反复打开，下一次明确点击一键填充仍可重试。

## 4. 任务卡

### P00：记录基线，不改业务

**依赖：** 无。

**阅读：** package.json、build.mjs、src/manifest.json、test/run.ts、test/playwright.mjs、content/index.ts 的 fillCurrentDocument/FILL、background/index.ts、现有安全提速计划。

**允许修改：** docs/dev-notes 下基线与进度文档；本卡不改业务、锁文件、测试期望。

**步骤：**

1. 记录 commit、dirty 文件、版本、依赖实际安装版本、构建输出路径和测试环境。
2. 逐条运行现有检查，记录退出码和失败。旧计划的“自动下一步耗时”条目废弃，不能照抄。
3. 清点根目录与 scrape 资产，先记录相对路径/大小/类型，不输出账号、令牌或完整页面脚本。
4. 选择代表性基线：普通表单、北科 14 项成果、合工大教育 picker、已有值、负例区域。
5. 列出所有生产写入入口：contract、fillAll 内静态表、延迟补填、picker、地区直写、processRowJobs、日期修复、主世界桥。逐一记录调用方和异步边界。

**验收：** 基线和账本齐全，确认已有失败范围；未改源码；至少五种机制有基线或明确证据缺口。

**失败处理：** 不在本卡顺手修代码。环境失败单独记录；需要修复时单建最小前置任务，不能降低断言。

### P01：建立“该写的写对、不该写的不动”回归

**依赖：** P00。

**允许修改：** test/samples、test/regression、test/playwright 相关测试入口、package.json scripts、必要的测试构建配置。禁止移动/删除根目录原快照。

**步骤：**

1. 样本分 `static-snapshot`、`behavioral-fixture`、`live-evidence`；不得把合成页面标真实验收。
2. 原快照以复制后脱敏方式转为最小样本；去掉会话路径、URL 参数、hidden token、内联账户 JSON、storage 片段、远程脚本/表单 action。保留 DOM 结构与稳定 id，敏感值替换合成哨兵。
3. 初期不设 20 样本硬指标。用最少样本覆盖本计划附录 R01–R24，可组合在同一夹具中；表明每个机制来自哪项样本。
4. runner 禁止所有未声明网络。路由到本地模拟页面时，在加载前注册拦截；未知请求直接 abort；不执行原学校远程脚本。
5. 观测实际值、selected、checked、模型载体、行数、setter/事件/按钮计数。只比最终值不足以识别“写错后又改回”；对敏感按钮与只读目标加副作用计数。
6. 每个正常样本有 mustWrite、mustPreserve、mustNotTouch；只有所有字段跳过时必须失败。
7. 测试生产导入函数与真实打包扩展，不能在 runner 复制 matcher/executor 逻辑。引入 scripts 并验证实际执行到新样本。

**样本声明至少包含：** id、sourceKind、脱敏说明、逻辑测试 URL、页面身份、合成 profile、目标元素断言、精确期望值、保留值、允许的元数据副作用、是否需要浏览器。

**验收：** 观测器能准确报告错误目标实际修改、mustWrite 完成与缺口；测试自校验能发现故意模拟的一次 forbidden mutation。已通过的现有安全基线保持通过；禁保存/下一步/最终提交和网络隔离门禁生效。对尚未实现的目标行为保留明确 baseline-defect/not-implemented，不能把红项抹掉或把它当阻止后续修复的循环前置条件。产品最终要求的零越界/完整 mustWrite 在对应任务卡接管后转为 hard gate。

**注意：** 通过 jsdom 可见性 shim 的样本必须标识，不可据此证明真实页面可见性。真实 React/Vue 支持只在实际框架本地运行夹具测试后声明，不能用普通 input 冒充。

### P02：只读候选解析与确定性消歧

**依赖：** P01。

**阅读/允许修改：** adapters.ts、adapter-packages.ts、matcher.ts、control-drivers.ts 中的定位逻辑；按需新增 fill-task.ts/task-compiler.ts；对应回归。不得在本卡切换整个生产执行路径。

**步骤：**

1. 新建只读候选 API，与旧 API 并存。返回候选、证据层、缺口和歧义，不填写、不点按钮、不写识别属性、不创建 storage。
2. Package 评分只基于当前 URL 实际命中的 host/path 分支。比较使用明确阶梯：匹配 host 类型、匹配路径具体程度、匹配页面结构证据；不能累计无关 host 和路径数量加分。
3. Page 必须同时满足 path、title、required/forbidden selectors 等明确约束；同等级多个 pageId 未能消歧则返回歧义，不按数组顺序。
4. 控件按 nativeId→有序 selectors→精确标签作用域解析。每层使用候选集合验证逻辑目标唯一；重复 id 也要检查。
5. 现 selectors 保留“有序回退”语义：A 唯一有效时用 A，A 缺失才试 B；A 多逻辑目标不直接跳到 B 掩盖问题。若需要等价选择器组，使用不同显式字段，不改变旧数组含义。
6. 组件、radio、代码名称对按一个逻辑目标处理。普通字段标签唯一要求在所属表单/章节，不是整个 document 只许一个相同标签。
7. fingerprintDocument 保留诊断用途；新 scope 判据排除扩展 UI、动态行与弹窗的正常变化，不将整个控制列表 hash 当异步硬锁。明确证据版本。
8. 针对 detectComponentDropdownFields 的属性写入，抽出只读 collect 结果；旧调用点的标记动作留在执行阶段，以免 shadow 编译产生行为。

**验收：** 改 package/page 数组顺序不改变唯一结果；添加无关 host 不改变排名；重复 id/多目标局部歧义；合法 radio 组不误判；Compiler 前后目标值、DOM 属性、storage、事件计数均不变。

**停止条件：** 分不清两个真实目标时记录字段缺口，不拓宽选择器“随便命中”。

### P03：消除双写，保留完整填写覆盖

**依赖：** P02。

**允许修改：** control-drivers.ts、filler.ts、content/index.ts 的 fillCurrentDocument 合并路径、fill-task.ts 与回归。限于去重与结果身份，不在此卡接入全部异步回读。

**步骤：**

1. 契约结果为每个已定位目标返回 target identity；当前成功/失败结果缺 el，先补齐内存结果，跨消息不能直接发送 el。
2. 引入运行内 claimedTargets/handledElements，不使用 data-tui 或 tui-filled 作为授权真源。
3. 给 fillAll 增加兼容性可选参数，排除已认领逻辑目标；默认参数维持旧公开 API。静态 family/CET/experience/award/retro 表预处理也必须遵守排除集合，不能只过滤 detected 循环。
4. 契约已写、冲突、失败/歧义和等待 picker 的目标不由通用链重复写。未定位目标或合同外独立字段仍保留既有填写能力。
5. 合并 contract 与 generic 的结果，按 targetId 去重，不能因为契约字段不在 FIELD_RULES 中而丢掉成功统计。
6. 没有处理完成 Table Contract 前，不启用 contract-only 整页模式，不删除 processRowJobs。

**验收：** 同一逻辑目标一轮只执行一次主要写入；契约专有字段保留结果；合同外既有可填字段照常填；picker/表格基线不退化；重复 UI 高亮刷新不影响 claim。

### P04：统一已有值语义和本轮清除所有权

**依赖：** P03。

**允许修改：** value-semantics.ts、普通字段/原生 select/radio/date 的单项执行边界、FillItem/FillStats 消费者与测试。类型新增状态需一次覆盖所有 switch/报告/统计消费者，禁止用 any 消除类型错误。

**规则：**

| 状态 | 动作 | 是否计入本轮可清除写入 |
| --- | --- | --- |
| 可写且空 | 执行现有驱动 | 成功后是 |
| 非空且语义等价 | alreadyCorrect；不 setter/click | 否 |
| 非空且不同 | conflict，保留原值，仅该目标暂停 | 否 |
| 无法可信读取当前值 | waitingUser/blocked | 否 |

**实现细节：**

- 空值由驱动判断：select 的非空占位 option、radio 未选中、mask 占位、代码名称对一半为空分别定义。不能把字符串 `'0'` 当空。
- 文本默认 trim 两端；身份证只对末位 X 大小写归一；数字代码保留前导零；email 不随意改本地部分大小写；长文不擅自合并空白、截断或改标点。
- 日期按明确 precision 归一，不能把年月比较成任意同年日期；名称与内部代码用成对模型，不用文本包含判断等价。
- user 默认已选 radio/select 也是页面已有值，按冲突保留；可疑默认不能自动假定用户未选择。
- 锁定档案数据仍可用于填网页，锁定不等于禁止写网页。
- alreadyCorrect 允许成功外观，但清除本页只能清本轮确实写入且此后未被用户改动的目标；clearPageFill 不再只依赖绿色标记判断所有权。刷新后无法证明所有权时不清未知目标。

**验收：** 同值零 setter/事件；异值零变更；选择框占位可填写；radio group 合法；用户原有正确字段在点击清除后仍保留；用户后改字段也不被清除。

**本卡不做：** 默认覆盖开关、让用户为每个字段确认、新增弹窗兼容体检。

### P05：轮次/文档作用域与跨 frame 完成协议

**依赖：** P04。必须先于 P06 异步执行器进入生产。

**允许修改：** fill-session.ts、background/index.ts、content/index.ts 消息和生命周期、picker-handoff.ts 的取消入口、对应 E2E。

**步骤：**

1. 每次明确点击分配 runId，每个 Document 分配 documentEpoch；父 frame 和子 frame 不能仅靠 origin/path 视为同一个任务。
2. background 使用 sender.tab.id/frameId/documentId（可用时）等浏览器提供身份，不能信任页面自报身份替代。内容端保留本地 documentEpoch 检查。
3. 注册资料/规则变更监听，再读快照；处理监听与首次读取之间的竞态。运行内使用稳定 source revision，不对 normalizeProfile 产生的时间字段每次重新 hash 导致误取消。真实用户改 profile/package 使旧任务失效；本轮学习 codebook 可延迟到终态再落库。
4. 路由变化使用脱敏逻辑 pageKey；不把 query/hash/token/姓名编码路径写入存储或日志。正常弹窗/加行不改变 page 身份。
5. awaited 操作前后检查 signal、runId、documentEpoch、目标 isConnected 与 registry 所有权；同 id 新节点重新只读解析，不复用旧 Element。旧任务失效后不得恢复写入/回滚。
6. 扩充消息为 start/progress/frame-terminal/run-summary，具备 runId、frame 结果序号与白名单 summary。新进度只替换相同 frame 的旧序号，不能不断 items.push 叠加。
7. 将 1200ms 变为发现/无回应超时用途，而非成功终态。维护已握手 frame 集合，等待各 frame terminal 或明确 timedOut/removed；不能因零返回 frame 就报成功。新建 iframe 加入有界发现窗口，窗口外记录未参与，禁止伪称全页覆盖。
8. Service Worker 重启/状态丢失后显式重新协调或提示中断，不拿未知旧消息拼出成功。用户重点击取消前轮，独立新轮次接管。

**验收：** 超过 1.2 秒的任务不提前完成；迟到旧 FILL_RESULT 被丢弃；相同 frame 更新不重复计数；iframe 相同控件 id 不互相 claim；导航/DOM 替换/档案更新可取消；无返回 frame 显示未完成。

**进度守恒：** eligibleTotal = pending + written + alreadyCorrect + conflict + blocked + waitingUser + failed + cancelled；profileEmpty/noMatch 是观察项，单列，不强行纳入 eligibleTotal。类型和 UI 必须使用同一定义。

### P06：稳定回读与可归因验证

**依赖：** P05。

**允许修改：** task-executor.ts、value-semantics.ts、control/date/component 驱动的最小 read/settle 包装、content 调用点、状态与回归。不得复制已有日期或 picker 内核。

**步骤：**

1. 让迁移后的普通字段调用现有 writer；执行器负责读 before、比较、write、immediate read、settle、stable read、提交状态。
2. 新生产路径显式 async，上游 await 或跟踪 lifecycle；旧 fillAll 同步封装保留兼容，禁止在 fire-and-forget 后马上发布 filled。
3. settle 由 driver 声明。普通独立字段可分批写后批量复核，避免字段数×固定 350ms 串行成本；级联和回发敏感操作串行。
4. 原生字段使用有界事件循环稳定检查；受控组件读真实载体/selected/hidden model，保留原有必要延迟上限。rAF 在后台页可能暂停，必须有 wall-clock 上界与取消；不靠无限轮询。
5. 已有日期自愈、三级联重试由同一任务调度；本轮迁移目标不得同时运行旧独立重试定时器。先按目标 claim 抑制旧轮次，不删未迁移驱动的兼容重试。
6. validation 先记录可见错误基线，回读后只处理新增/变化且可关联当前目标的错误（aria-describedby、字段错误节点、合同关联）。空/隐藏容器和原有无关错误不使字段失败。无法归因只生成 page warning。
7. 350ms 不是服务器接受证明，文案精确说明 DOM/模型回读。观察窗口外潜在变化列局限，不承诺永远不变。

**验收：** 受控组件即时成功但稍后清空→failed；延迟选项真实到达→成功；原有别的必填错误不误判；背景标签不永久挂起；取消后没有补写；多字段耗时不呈固定等待简单累加。

### P07：有条件恢复，不承诺通用撤销

**依赖：** P06。

**允许修改：** executor 内存快照与最少驱动恢复接口、用户可见失败摘要及测试。不新增快照持久化。

**步骤：**

1. 空状态也保存 before（空字符串、未选项、checked 状态等）；否则大多数允许写入的操作没有恢复基准。
2. 驱动明确声明 reversible/notReversible。初期只支持证据充分的原生值恢复；代码名称对、框架组件、触发回发的操作默认不支持通用回滚。
3. 仅在同 run/document/target、没有用户编辑、当前状态仍可证明属于本次写入或其直接结果、驱动未发生不可逆副作用时尝试恢复。
4. 用户 trusted input/change 或任务外模型变化后停止自动恢复；无法区分来源也停止，保留当前页面交给用户。不能因为 isTrusted=false 就认定一定是扩展自己的写入。
5. 恢复后再次回读，分别报告 restored/restoreFailed/notAttempted；失败不循环重试，不自动删表行、不清表、不导航、不保存。
6. 原始值只留内存；默认字段报告、日志、复制清单不包含原值或目标值。需要查看详细内容可在扩展本地详情中短时显示掩码信息，本轮无需建设值级导出。

**验收：** 空值写失败可按驱动策略恢复空；用户同时手改不被撤销；页面导航后零恢复动作；不可逆驱动明确人工；sessionStorage/DOM data 属性/消息 DTO 无新增真实值快照。

### P08：把 picker 和人工接管纳入同一轮次

**依赖：** P07。

**允许修改：** picker-state-machine.ts、picker-handoff.ts、school/major/blue-flat/minimal/component 驱动接口、content/index.ts picker 编排；按一类协议一个小差异验证。

**步骤：**

1. 保留现有学校/专业串行、代码名称显示三联校验和真实选项点选，不替换为可见文本直写。
2. picker 任务认领 trigger 与全部 carriers；父 pageDocument 和弹窗 iframe 的 Document 分别跟踪。
3. 打开、查询、选择、回填每一步检查当前 scope。候选唯一化基于代码/名称/分类/父选择上下文；近似候选可以展示但不自动选第一行。
4. 人工卡片仍使用现有 controller；新任务替换时清 timer/listener，旧卡片回调不得恢复队列。本轮跳过保持至下一次明确点击。
5. 代码字段半填/名称不一致时视为冲突或需人工，不为修复而自动清掉用户已有非空值。
6. 盘点现有 picker state 的 value/context 持久化。新增 raw 值不进入页面 sessionStorage；新格式只存匿名进度、字段路径和必要非敏感驱动状态，恢复时从当前档案/合同重新生成上下文。老状态兼容读取后重新验证，不批量删除全部用户 sessionStorage。

**验收：** blue-flat 和 minimal 代表例通过；同名近似候选不乱选；手工完成后继续独立任务；跳过不反复弹；重新一键可重试；新 iframe 换代后不操作旧节点；合法已有 codebook 来源不被清空。

### P09：动态表、旧补填与依赖顺序

**依赖：** P08。

**允许修改：** dynamic-table.ts、filler.ts 五类表包装、retro-honor-fill.ts、row-job-progress.ts、content/index.ts processRowJobs、合同类型的最小表目标声明。

**步骤：**

1. 现有 DynamicTableSpec 继续执行；增加表逻辑身份、允许操作范围、来源集合、稳定行 ID 与 scope，不重写加行内核。
2. 静态槽、inline 表、弹窗新增、postback 表分别登记，不把所有表统一假设“每点一次新增一行”。
3. 每次新增前确认不是用户半填行/编辑已有行；新增后使用真实行数/编辑表单证据。取消后不再点下一条，不自动删除已创建行。
4. 后台/延迟 refill 不得并行再启动同一表任务；正常加行不引起页面作用域失效，DOM 重建则重新定位。
5. 父子依赖引用任务 ID，先实现现有一条真实需求（如省→学校→专业）。父 written/alreadyCorrect 且语义回读完成才继续；父 conflict/waitingUser 则仅阻断子树，独立项继续。
6. 检查依赖引用和环；复用有界条件等待；迁移目标旧 retry 统一交给调度器。不要在此卡新增跨任务 option cache。
7. 仅有真实页面/驱动证据的表才加入合同；定位器输出只是候选，不自动升 verified。

**验收：** 北科 14 项成果仍 14 行正确且不重复；半填行原样保留；加行失败不回滚用户行；同一表不双跑；合法增长不误取消；回发后不复用旧行节点；环拒绝；父失败不阻塞无关字段；自动下一步计数仍为 0。

### P10：修正代码和资料转换的语义风险

**依赖：** P09；可拆 P10a 地区/长度、P10b namespace 两个顺序小补丁。

**允许修改：** regionutil.ts、filler.ts 相关 derive/长度分支、standard-code-catalog.ts、profile.ts get/setProfileCode、popup-binding.ts、采集 codebook 来源校验及回归。

**步骤：**

1. 地区：档案已有值照常填；空籍贯/出生地/户口地不再直接由身份证区划推定为事实。可返回“缺资料/可参考区划”但不持久化猜值、不扩大提示到全部字段。
2. 长度：普通字段不得无提示改变核心信息。按页面可信 maxlength/合同限制决定是否可填；超限保留空/现值并提示，不裁剪身份证/电话/代码。保留已有明确格式化日期逻辑，不能把格式转换误判为截断。
3. 名称：全半角/空白归一需保守；不得一律删除括号造成校区/方向混淆，官方别名只在数据有证据时使用。
4. namespace：页面原生精确选项和当前目标 namespace 优先。MOE 名称反查可辅助搜索，但只有合同声明与目标系统一致时才能作为要写的内部 code；名称匹配不是 namespace 相同证据。
5. codebook 保留原始条目/用户数据，新增来源/目标说明保持向后兼容。采集的真实 code/name 对、用户确认和真实 picker 回读都可以作为来源，不限死为 picker 一种。
6. 本轮不下载全量标准码、不对用户资料做迁移清洗。旧 namespace 不明时不误用代码，可通过真实页面按名称精确选择；没有选项则人工。

**验收：** 身份证区划与户口不一致不被推断覆盖；超限值没有静默裁剪；同名异码/同码异名/错误 namespace 不自动接受；带 K/T 专业码保留；既有资料导入导出及锁定不退化。

### P11：完整合同页面试点与轻量证据

**依赖：** P10。

**允许修改：** adapters.ts、adapter-packages.ts 中一个具体试点页面、test/evidence 或 evidence 目录、check-adapters 工具与测试。每次只一个页面，最多先验收三个页面。

**试点选择：** 从 P01–P10 已有最强样本选，不硬指定尚无完整样本的大学。一个普通字段页先试点，再考虑 picker/表格；用例缺什么就列缺口。

**步骤：**

1. 每个 pageId 列完整控件清单：可填字段、用户保留项、表格、只读/不适用、未支持项。禁止只写三条合同就宣布整个页面 contract-only。
2. 新策略仅对这个 pageId 显式开启。旧包无新策略时使用兼容默认，不看 capability 字符串擅自切换。
3. 对照同一冻结 profile 与页面状态，证明旧正确填写项未减少；减少项必须归为已证明误填/冲突/不应推断，写出证据，不用“更安全”一句替代。
4. evidence 记录 package/page/version、合同内容 hash、样本 hash、测试命令/结果、框架行为覆盖、真实验收状态和局限。hash 只绑定公开脱敏产物，不持久化个人资料 hash。
5. offlinePassed 与 liveVerified 分开，失败/超时/缺测试不得由人工改字符串变成功。现有 verified 不全部降级或全局封禁，标记历史状态未回验即可。
6. 回退只撤销本次试点策略/合同版本，不回滚 Profile、锁定或 codebook。先使用本地声明策略回退，不改造远程 rules 的 storage 协议。
7. 校验 evidence 引用、文件内容 hash、页面/包/版本一致，不止检查“文件存在”。标准 package version 与 minCoreVersion 关系写清；不随意把当前 2.0.0 核心兼容号改为 2.0.5。

**验收：** 完整覆盖表可审查；合同外实际写入=0；合同内 mustWrite 全部通过；缺合同表格不能启用该页完整模式；只影响指定页面；策略回退不丢档案；没有伪造 live 验收记录。

**真实验收限制：** 本任务书不授权新的认证网络操作。缺实页时停在离线试点，生成脱敏采集需求，不自行拿本机 Cookie 发请求。

### P12：报告、保存证据作用域与最终门禁

**依赖：** P11 的离线试点工作完成；live 证据可以仍明确 pending。

**允许修改：** fill-telemetry.ts、error-codes.ts、panel.ts、后台/内容 DTO、save-guard.ts、开发文档及 CI 配置。保留现有 UI 风格，不顺带重做 Options 页面。

**步骤：**

1. UI/复制报告区分写入成功、已有正确、资料缺失、识别缺口、冲突保留、依赖等待、人工接管、回读失败、取消；字段失败不伪装整页停机。
2. E1301/E1307 定义为 scope/revision 失效；E1302 页面歧义或字段歧义明确 scope；E1303 控件歧义、E1304 冲突、E1306 稳定回读失败按字段处理。已有 E110x/E120x 保留兼容，不用码段推断作用范围。
3. telemetry/DTO 采用 allowlist 脱敏；不复制 label 周边整段 DOM、真实输入、搜索词、raw URL、验证错误原文。用户可读提示引用字段友好名称与建议，不带原值 X/目标值 Y。
4. save-guard 证据增加 package/page/table 身份、时间与版本。仅同一明确表才比 rows/filled；换页/表不存在不误报。行标签“编辑/删除”等固定操作文字不算用户内容；原生 select 的真实选中值要正确纳入非空判定。
5. E1205 仍是“疑似保存/回发后丢失”，不据此宣称服务器保存成功或失败已经证实。保持不自动保存。
6. 不新增最近 50 次用户运行历史数据库；优先复用现有有界 telemetry。确需持久化摘要另开后续任务。
7. 接入稳定可复现的 check:adapters 和 regression 到 CI；安装锁定依赖，保证真实测试入口被执行。新增浏览器测试不得请求高校网络。
8. 同步 README/使用指南/隐私说明与实际能力，写升级方式：导出档案、保留原扩展 ID/加载目录、覆盖构建目录后重新加载；换环境使用导入。此卡只写说明，不发布。

**最终验收：** 当前批次全部回归通过；来源于旧行为的正确填写覆盖不下降；无自动保存/下一步/提交；档案导入导出 round-trip 和锁定保留；错误/统计不重复；报告无真实值；真实网站未验证的内容逐项列出。

## 5. 回归验收矩阵

编号是机制用例，不要求一项一个 HTML 文件。每个机制都必须在 runner 中有实际断言。

| ID | 场景 | 必须满足 | 层级 |
| --- | --- | --- | --- |
| R01 | 契约和通用规则指向同控件 | 主要写入一次，契约结果不丢 | unit + 扩展 |
| R02 | 合同外既有正确可填字段 | 兼容页继续写对，不能全部停止 | unit + 扩展 |
| R03 | 原值与目标相同 | 不 setter/click，清除不影响原值 | unit + browser |
| R04 | 原值与目标不同 | 保留、显示 conflict，独立字段继续 | unit + browser |
| R05 | select 占位、零值和前导零代码 | 空值与等价判断正确 | unit |
| R06 | 重复 id / 同分 page / 无关 host 加分 | 歧义不乱选；精确包排名稳定 | unit |
| R07 | radio 一组多节点、code/name 多载体 | 不误判多逻辑控件 | unit |
| R08 | 扩展 UI 插入、动态加行、弹窗出现 | 不误判页面漂移 | unit + browser |
| R09 | await 中同 id DOM 替换或导航 | 旧引用不写、不回滚 | browser |
| R10 | 连点新一轮/迟到旧 frame 消息 | 旧轮取消；新状态不被覆盖 | 扩展 |
| R11 | 写入超过 1200ms、frame 不返回 | 不提前成功；显示等待/超时 | 扩展 |
| R12 | iframe 相同 id、跨 realm 节点 | 分别处理，不互斥、不串数据 | 扩展 |
| R13 | 即时有值稍后框架清空 | 稳定回读失败，不显示完成 | browser |
| R14 | 用户在 settle 期间编辑 | 用户值保留，不自动恢复旧值 | browser |
| R15 | validation 空/隐藏/旧错误/他字段错误 | 不归因当前字段，新增关联错误才失败 | browser |
| R16 | blue-flat/minimal picker 与近似选项 | 精确成对回读；近似不选 | browser |
| R17 | 人工接管、跳过、新一轮重试 | 不循环弹窗，队列可继续 | 扩展 |
| R18 | 北科 14 条成果 | 14 条都对、不重复、不下一步 | 现有 E2E |
| R19 | 半填表/新增失败/编辑对话框 | 不覆盖用户行、不自动删行 | browser |
| R20 | 父选项延迟/父冲突/依赖环 | 条件等待；仅子树暂停；环拒绝 | unit + browser |
| R21 | 地区推断、超限值、括号名称 | 不静默制造或改变事实 | unit |
| R22 | namespace 错/近名/专业 K-T 后缀 | 不误用代码，来源兼容 | unit + browser |
| R23 | 锁定档案、导入导出、清除本页 | 数据完整、锁定可用于填写、只清自己的 | unit + 扩展 |
| R24 | 上传/登录/提交/外网/敏感日志 | 无未授权副作用、外网漏出和真实值泄漏 | 扩展 |

**硬门槛计算：**

```text
正确覆盖率 = 精确通过的 mustWrite 逻辑目标数 / 声明 mustWrite 逻辑目标数
用户值保留率 = 未变的 mustPreserve 目标数 / 声明 mustPreserve 目标数
实际越界修改 = forbidden 目标值/模型修改次数 + 禁止按钮点击次数
```

分母为 0 的样本不得报告 100% 正确率。blockedAmbiguities 是诊断数，不是失败率；错误候选被挡住本身是正确结果。严格区分 attempted/blocked/executed；只有 executed 的越界副作用必须为 0。

最终只对已声明覆盖的机制谈通过率，不把缺样本的学校计入通过。

## 6. 主要风险与具体对策

| 风险 | 对策/回退 |
| --- | --- |
| 兼容功能被收窄 | P03–P10 不启用全局新策略；mustWrite 与旧基线对照；回退本卡代码，不关闭全部功能 |
| 新结果类型破坏面板 | 一次查全 FillItem/Stats 消费者；保持旧映射适配，终态之后不被迟到日志改回进行中 |
| 重试冲突造成重复写 | 迁移目标只一个调度者；claim 与 run generation；旧驱动限未迁移目标 |
| 指纹过敏感 | 整页 hash 仅诊断，scope 看文档/路由/锚点/目标代际 |
| 回滚覆盖用户输入 | 来源不确定就不恢复；复杂控件默认不可通用撤销 |
| 样本泄漏或联网 | 最小脱敏副本、外网全拦截、扫描后入库，不打印原始秘密 |
| 单测绿但真实网站失败 | 离线/行为/live 三层证据分开；缺实页明示 pending |
| Profile/远程规则兼容损坏 | 不改数据 schema 或远程存储协议；只添加兼容字段；round-trip 与旧数据样本 |

## 7. 后续任务，不计入本轮完成条件

| ID | 工作 | 启动前提 |
| --- | --- | --- |
| B01 | 更多学校页面合同 | 当前试点真实验收后，逐页复制证据流程 |
| B02 | 适配包独立版本与单包回滚 | 确有独立分发需求；先设计旧 rules 数据兼容 |
| B03 | 适配候选生成 CLI | 候选 API 与证据 schema 稳定；默认只输出草稿 |
| B04 | retro family 分类/共享 spec | 至少两类样本证明共性；先归类不搬驱动 |
| B05 | TS 合同迁移 JSON | 引用校验已稳定；一次迁一个包，不碰目录层 |
| B06 | 选项缓存和冷启动优化 | 计时证明瓶颈；父值/DOM/选项版本变更可失效 |
| B07 | OCR 准确率评估 | 独立样本和指标，不混入表单字段成功率 |

自动保存/下一步、外部 AI 字段映射、桌面 RPA、账号自动化不在上述 backlog 授权内，用户另行决定。

## 8. 每张任务卡的交付格式

实施 AI 的回复必须包含：

1. 本卡编号和完成状态。
2. 修改了哪些行为、为什么；列出实际文件。
3. 已运行检查和退出码；未运行/失败的明确说明。
4. 对应 Rxx 回归是否通过，原有能力有无下降。
5. 用户数据/迁移/真实网站验证的剩余限制。
6. 账本位置与下一张可执行任务。

不需要每次贴整份计划。不能写“应该通过”“理论支持全部学校”“已经完全兼容”替代执行证据。完成一张卡不等于本轮所有任务完成。

## 9. 完成定义

主链 P00–P12 的离线实施、测试和报告完成，全部新增执行路径有回归；若 live 验收未授权或缺证据，明确保留 live pending，生产合同模式不越过证据边界。

没有提交/发布要求时，交付是可审查的本地改动与测试记录。正式升级另按用户发布指令执行，并保留个人档案与扩展 ID。不得把“计划写完”当“代码实现完”，也不得把“本地夹具通过”当“用户真实页面问题已解决”。

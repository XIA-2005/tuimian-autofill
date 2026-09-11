# 预推免填表助手与巨能填系统：本地源码分析

分析日期：2026-09-09。对象为当前工作区与 D:\巨能填系统-1.8.9，不代表线上最新版本。

## 阅读范围与结论边界

已完成业务源码目录清点、入口定位、主要数据模型与填写链路阅读，以及关键差异分析。对核心文件阅读了入口、函数结构与关键实现；没有逐行审计全部代码，也没有登录高校网站、运行竞品桌面程序、执行注册/保存/上传、调用 AI 服务。本文的“具备实现”不等于真实高校页面已验证通过。

你的 src 下有 60 个 TS/JS 文件，合计 1,043,003 字节，包含测试与数据代码。竞品仅 bridge/bridge/core 就有 814 个 Python 文件、23,606,785 字节；另有扩展和 Worker。规模统计不代表质量或成功率。

竞品提供的是带大量可读 Python/JavaScript 业务源码的安装分发包，不能称为完整开发仓库：看到 Qt 程序与构建元数据，未发现其桌面应用自身的 C++/QML 源码；Worker 的 package.json 引用了测试文件，但分发目录未包含 test 文件夹。第三方库源码不计作竞品应用源码。

## 你的项目

### 产品与运行结构

package.json 和 src/manifest.json 均为 2.0.5。TypeScript + esbuild + Chrome Manifest V3，面向 Edge/Chrome。核心填写独立运行于扩展，不依赖竞品式桌面服务。

- src/options：档案管理页面；src/popup：工具栏弹出页。
- src/content/index.ts：页面操作总入口，组织填写、弹窗、加行、采集、补填与运行状态。
- src/background/index.ts：广播标签页消息、汇总各 frame 的结果与字段报告。
- src/world/main-world.ts 与 core/world-bridge.ts：隔离世界与页面主世界协作。
- build.mjs：构建 dist 和本地测试入口，复制静态资源及 Tesseract 浏览器资源。

### 数据模型

core/profile.ts 保留旧字段并提供 V2 原子档案。八类表是论文、专利、科研项目、学科竞赛、荣誉奖学金、实习、社会服务、学生工作经历；另有外语、计算机证书、长文等数据。

字段状态包含来源、锁定、时间和可信度，行有稳定 ID；codebook 按命名空间保存代码与名称，schoolExtensions 保存学校专有字段。core/storage.ts 将档案存入 chrome.storage.local，并在读写时执行 normalizeProfile。

core/projection.ts 把原子数据投影为目标学校接收的研究、奖励、实践、经历等旧栏位，生成临时视图，不改原始档案。不同学校可能把竞赛或项目放在不同栏目，这正是投影层的作用。

### 填写链路

1. 根据 URL 匹配平台和学校包，并为当前页面投影档案。
2. fillCurrentDocument 先调用 fillAdapterContract，再调用 fillAll。
3. matcher 提取 label、表格上下文、ARIA、name/id/placeholder；关键词匹配分数为层级基础分加关键词长度乘 2，并有负向关键词排除。
4. filler 先处理表格，再识别普通控件与自定义组件，读取档案值、格式化并写入。
5. 日期、学校、专业、地区、组件下拉分别交给驱动；弹窗还需处理显示名称与隐藏代码的关联。
6. 页面入口组织动态加行、延迟补填、回读及进度；picker-handoff 负责人工接管和恢复。

这不是单纯给 input.value 赋值的脚本。已有学校契约、通用规则、标准代码簿、组件驱动、动态表格、弹窗状态机和错误解释。

### 采集与可选功能

core/crawl.ts 包含页面快照、会话、合并预览、冲突处理与提交合并。南航包明确声明七类只读资料页面及禁止路径，并处理编码路径识别。包内的 verified 标记属于本地配置声明，本次没有重新实测。

core/rulesync.ts 默认关闭远程规则更新，校验 schema/最低核心版本，并保存候选与上一版本；默认 URL 存在于源码，不表示该地址目前可用。

验证码功能默认关闭，包含 Tesseract 路线与 localhost:18765 桥接路线。档案使用 storage.local，但验证码设置使用 storage.sync，因此“所有设置都只保存在本机”并不准确。

### 值得后续验证的具体问题

- fillCurrentDocument 在契约驱动之后再次运行通用填充，没有在此入口把契约已处理元素作为排除集合传入。可能重复处理同一字段；是否造成覆盖需要独立测试。
- filler 对空籍贯、出生地、户口地使用身份证区划兜底。三者语义并不等价，可能把猜测当成用户事实。
- 部分普通字段按 FIELD_LENGTH_CAPS 截断；长文另有不静默截断的处理。两种策略需要统一向用户说明。
- rulesync 的 CORE_PACKAGE_VERSION 为 2.0.0，而扩展版本为 2.0.5。可能是有意保留的兼容版本，也可能导致未来规则被拒绝，需明确版本约定。
- content/index.ts 和 filler.ts 承担较多学校特例；维护风险来自分支交互，不只来自文件大小。

以上是源码发现及待验证风险，本次未修改。

## 巨能填系统

### 运行结构

顶层用户说明描述的结构是：baoyan-native.exe 启动器 → runtime 中 Qt 主程序；bridge 提供 Python 业务；worker 提供 Node/Playwright 任务；browser_extension 连接桌面软件。

桌面包目录标为 1.8.9，扩展 manifest 为 1.4.61，Worker package 为 0.1.0，属于不同组件的版本，不应直接判断为版本错误。

扩展申请 storage、activeTab、scripting、tabs、cookies、alarms 和广泛主机权限。extension_bridge.py 默认桥接端口 18766，可由环境调整，检查有效 token；background.js 负责代理和按需注入。不能脱离桌面服务独立理解其完整填写行为。

Worker 使用 JSON-lines IPC，支持 probe、login、register、extract、fill、upload、save_verify 等操作；legacy_bridge.py 再将部分操作路由到 Python 旧业务入口，并保留可恢复会话及人工介入状态。

### 资料与任务模型

canonical_schema.py 包装既有 Hub 字段，加入实体、长文、学校扩展，并区分空值、未知、不适用、用户未提供。

填写不是仅从单个 profile 读取：有面板数据、多校快照、多来源优先级、冻结与计划编译。fill_source_priority.py 明确按同系统、控件形态、转换代价选择来源；表格、复古固定槽与长文本是不同目标形态。

pipeline.py 组织多源提取、合并、多目标顺序填写与校验，并包含导航、登录等待、页面恢复、保存反馈等逻辑。另有账号注册、结果查询、材料上传和 Word 表单流程。此处确认有实现路径，未验证每所学校是否可执行。

### 学校适配

platform_taxonomy.py 将平台划为蓝色、复古、简约、外语、封面、精致和其他七类。通用平台层之下还有大量学校独立模块，例如 cover、flu、thu、xmu、zju、ucas 等。

adapter_package_* 系列覆盖包加载、同步、生命周期、能力开关、签名、撤回与验收。签名代码包含摘要清单和可选 Ed25519；trust_mode 默认 development，因此不能仅凭存在签名模块宣称默认生产环境强制验签。

构建元数据中的某份 native 控件证据目录记载 67 个 adapter、complete_count=0、66 个 not_collected；这是该特定证据目录的状态，不能推导为所有 Python 适配器不可用，也不能把“67”当成实测通过学校数。

### 填写内核和浏览器驱动

fill_kernel.py 的流程为 FillRequest → 目标身份解析 → 数据冻结 → 适配包 → PageWritePlan → 驱动执行 → 提交策略 → 回读。计划记录任务、包、映射和 fixture 摘要，目的是减少不同入口使用不同数据和规则。

page_protocol_fill.js 消费 write_items，执行控件操作与即时回读。已有针对 ASP.NET 回发、级联、输入事件、隐藏代码、页面状态的特殊处理。例如 softDomEvents 会限制部分 change/blur，避免整页回发冲掉未保存值。

该文件为 3,095,484 字节，content.js 为 966,423 字节。background.js 对部分页面采用轻量壳和按需注入，代码注释明确提到避免大协议脚本编译阻塞。

“统一内核”是已存在的实现，但不能直接推广为全部路径统一：仍保留旧学校专项流水线；AI 未知页明确使用独立准备通道。扩展当前页协议不自动保存，而桌面流水线有子页保存/下一步代码，应分入口说明边界。

### AI 未知页面

ai_unknown_page_fill.py 从冻结资料与控件结构生成映射，再交给页面协议。ai_fill_orchestrator.py 包含控件分层、级联排序、选项匹配、日期规范化、映射清洗、回读及下一轮判断。

其直接模型请求路径会把 applicant_data、页面 URL 和控件结构组成请求发往配置的 /chat/completions。默认模型与地址是源码默认值，不能证明用户当前配置。可以确认：该 AI 路线并非纯本地资料处理；本次未调用。

### 存储、交付与局限

用户说明声明 data/runtime_data 为本机数据，升级保留，runtime_data 包含 SQLite 与界面设置。data_crypto.py 提供设备关联密钥及 AES-256-GCM，也存在加密依赖缺失时的明文降级代码。因此“具有加密模块”不等于所有数据始终加密。

完整包升级脚本、浏览器联动、运行库及本地服务带来更多交付成本。桌面源码和测试仓库缺失，也限制了从这个分发包重建和验证完整产品。

## 对照判断

| 维度 | 你的项目 | 竞品 |
| --- | --- | --- |
| 产品形态 | 独立扩展，安装路径短 | 桌面软件与扩展联动 |
| 核心资料 | 本地标准档案与原子表 | Hub、快照、多源合并与冻结 |
| 页面识别 | 字段关键词和学校声明契约 | 平台分类、学校专项、契约和 AI 通道 |
| 控件操作 | 已有组件、日期、弹窗、加行驱动 | 更大体量的驱动与回发处理 |
| 流程范围 | 当前页面辅助及声明范围采集 | 跨校提取、注册、填写、导航、上传等实现 |
| AI 字段映射 | 未在本次核心链路中发现 | 明确存在未知页映射路径 |
| 错误恢复 | 状态、重试上限、人工接管 | 会话恢复、计划、暂停、驱动救援 |
| 可维护性 | 较轻，但入口与 filler 较集中 | 分层更多，但旧新路径并存、模块体量大 |
| 实际成功率 | 本次未实测 | 本次未实测 |

最有价值的借鉴是“目标页面身份明确、数据来源明确、写入计划明确、结果回读明确”。你的项目已经有原子档案与驱动基础，后续可先统一契约和通用填写的结果，补足来源冲突说明和真实页面验收证据。是否扩展桌面自动化或 AI，应由产品范围决定，不能因为竞品有就全部移植。

## 后续定位入口

- 查你的识别：src/core/matcher.ts；查赋值与表格：filler.ts、dynamic-table.ts。
- 查你的学校包：adapter-packages.ts；查资料：profile.ts、projection.ts、crawl.ts。
- 查你的交互恢复：src/content/index.ts、picker-handoff.ts。
- 查竞品跨校流程：bridge/bridge/core/pipeline.py。
- 查竞品数据准备与统一执行：plugin_fill_channel.py、fill_kernel.py、fill_source_priority.py。
- 查竞品实际 DOM 行为：browser_extension/page_protocol_fill.js、page_world_bridge.js。
- 查竞品 AI：ai_unknown_page_fill.py、ai_fill_orchestrator.py。
- 查竞品桌面通信：extension_bridge.py、bridge/bridge/legacy_bridge.py、worker/browser_worker/src/worker.js。

完整文件规模索引见同目录 source-inventory-2026-09-09.md。它用于后续精确查找，不代表其中每个模块都已逐行分析。

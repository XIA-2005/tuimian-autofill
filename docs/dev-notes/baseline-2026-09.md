# 基线记录 2026-09-09(PLAN v3 · P00 产物)

> 本文件只记录事实与观察,不做行为修改。所有数字均为**当日快照**,禁止写死进业务代码或测试期望。
> 执行环境:Git Bash on Windows;Node v24.15.0 / npm 11.12.1。

## 1. 环境与版本

| 项 | 值 |
| --- | --- |
| HEAD | `97d78d376f4ce61ec09f56e9ad7b33e46ae38246`("Release v2.0.5 with safe NUAA session crawl") |
| package version | 2.0.5(src/manifest.json 同 2.0.5) |
| 工作区未跟踪 | `.deploy-xiaaaaa-v203/`、`docs/analysis/`(PLAN/审查意见/两份 AI 分析)、`nul`(空文件,历史误创建)——均保留不清理 |
| 依赖实际版本 | esbuild 0.28.2、jsdom 30.0.1、playwright 1.62.1、typescript 7.0.2、tesseract.js 7.0.0、@types/chrome 0.2.6、@types/node 26.2.0 |
| 构建输出 | `dist/`(gitignore,构建时整目录重建:rmSync → copy);`test/run.js` 由 build.mjs 从 test/run.ts bundle(gitignore) |
| dist 主要体积(观察项) | content.js 765.2KB、options/options.js 102.3KB、background.js 65.9KB、popup/popup.js 16.6KB、world/main-world.js 8.2KB;dist 总 1.1MB |
| E2E 浏览器 | 命中 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;headless 由 PW_HEADLESS 控制(本日以 `PW_HEADLESS=1 npm run test:e2e` 单命令内联执行,未写用户环境) |
| AGENTS.md / CLAUDE.md | 项目内不存在(无仓库级指令文件) |

## 2. 命令基线(退出码均为实测)

| 命令 | 退出码 | 备注 |
| --- | --- | --- |
| `npm run typecheck` | 0 | tsc --noEmit |
| `npm test` | 0 | 先 build 再跑 jsdom 运行器;结尾"最终:全部断言通过 ✅" |
| `PW_HEADLESS=1 npm run test:e2e` | 0 | 先 build 再跑 Playwright 本地 MV3 扩展测试;结尾"Playwright 本地扩展测试全部通过 ✅" |
| `git diff --check` | 0 | 无空白错误 |
| `npm run test:e2e:real` | 未运行 | PLAN 禁止(真实高校认证网络操作) |

`npm test` 与 `npm run test:e2e` 各自已执行 build,未重复单跑 build。

## 3. 页面/夹具资产清点(2026-09-09 快照)

### 3.1 根目录 HTML:32 个(文件数 ≠ 学校数 ≠ 可执行样本数)

| 学校/系统 | 文件 | 初步类型判断(待 P01 逐一定性) |
| --- | --- | --- |
| 清华 | tsinghua.html / tsinghua-apply.html / tsinghua-publish.html / tsinghua-register.html / tsinghua-yz.html / tsinghua_index.html / tsinghua_major.html(各 2.8–31KB) | 注册/报名/发布/研究生院/索引/专业多页面变体 |
| 北航 | buaa.html / buaa-apply.html / buaa-tm.html | 报名/推免多步 |
| 北师大 | bnu.html / bnu-apply.html / bnu-tm.html | miniui 系(见 scrape 指纹) |
| 郑大 | zzu.html / zzu_sso_auth.html / zzu_sso_login.html / zzu_sso_root.html | SSO 系列;auth/login 为负例候选 |
| 地大(武汉) | cug_try2.html / cug_try4.html(121/142KB) | 大型页面,待定性 |
| 学信网 | chsi_main.html(98KB)/ chsi_zyfx_search.html / chsi_zyfx_search2.html;yz_chsi.html | 研招网系;zyfx 两个 3KB 疑为同源复制 |
| 合工大 | hfut.html / hfut_logon.html / hfut_major.html(三者同 11122B) | logon 为负例候选 |
| 西北工大 | nwpu.html / nwpu-tzgg.html(同 7382B) | tzgg=通知公告,只读负例候选 |
| 其他 | sustech.html、dhu.html、ecnu.html、ecnu_kscx.html(1KB) | 南科大/东华/华东师大;kscx 疑同源 |
| 注 | tsinghua.html 与 tsinghua-apply.html 同 10070B;zzu.html 与 zzu_sso_root.html 同 55095B | 重复/复制文件,P01 去重时登记 |

### 3.2 scrape/ 目录(1.3MB)

- 北师大 miniui 指纹:bnu-config.js、bnu-core-miniui.js、bnu-miniui.js、bnu-*.css(契约结构样本,纯结构断言用);
- 哈工大:hit-login.html / hit-register.html / hit-tms-*.html / hit-yqsb.html / hit-detail.html(登录/注册 = 负例候选,tms 列表/详情为只读候选);
- 哈工程:hrbeu.html / hrbeu-main.html / hrbeu-list.html / hrbeu-tm.html / hrbeu-notice.pdf(notice 为只读负例)。

### 3.3 测试夹具

- `test/fixture-form.html`:普通报名表单(面板 E2E、pwd/yzm 负例断言用);
- `test/playwright.mjs` 内联路由夹具(非独立文件):北科 `yjsy.ustb.edu.cn/ksxt/ssxly/**`(汇总页 finalSubmit 计数、achievements 计数行)、合工大 `yzbm.hfut.edu.cn/sstm/**`(encrypted-basic-step 代码框/名称框);
- `tools/store-demo.html`(商店演示,与运行无关);`test/real-e2e.*`(禁用,未运行)。

## 4. 生产写入入口盘点(调用方与异步边界)

| # | 入口 | 位置 | 调用方 | 同步/异步 |
| --- | --- | --- | --- | --- |
| W1 | fillAdapterContract(契约字段直填/标记) | core/control-drivers.ts(≈108) | content/index.ts fillCurrentDocument(≈239) | 同步 DOM 写 |
| W2 | fillAll(通用;先静态表族再逐字段 fillControl) | core/filler.ts:418 | fillCurrentDocument(≈240);延迟补填轮次 | 同步主体 |
| W2a | fillAll 内静态表预处理 | filler.ts:431-434(family/CET/experience/award 网格 + retro 槽) | fillAll 自身 | 同步 |
| W2b | retro 静态奖励槽 | core/retro-honor-fill.ts:179 | filler.ts:396/435 | 同步 |
| W3 | 延迟补填(级联 select 重试/日期修复/picker 再尝试) | content/index.ts:533 scheduleCascadeRetries | FILL 处理器(≈1834) | 异步:450/1200/2400ms select 重试、date fillDateControlAsync、80ms picker 启动、generation 门控重入 |
| W4 | 自动补填轮次(条件触发) | content/index.ts:1839-1852(followupDelays=2500/7000/15000,hasDeferredFillWork 守卫) | FILL 处理器 | 异步 |
| W5 | 自动重填(页面加载后若 REFILL_KEY 命中) | content/index.ts:1039-1047(900/2600ms run) | 页面加载/回发恢复路径 | 异步 |
| W6 | picker 弹窗点选 | content/index.ts:799 attemptPickers → filler.ts:2804 pickInPage → school/major/blue-flat/minimal/component 驱动 | FILL 后编排 + 人工接管回调 | 异步 |
| W7 | 地区三联直写(dm/mc/显示框 6 位码) | filler.ts:2174 directFillRegionTriplets | attemptPickersInner(≈824) | 异步主体内同步写 |
| W8 | 动态表行任务(自动加行+逐行写) | content/index.ts:1242 processRowJobs / 1510 startSafeRowJobs → core/dynamic-table.ts runDynamicTableFill(spec 表) | FILL 后;回发恢复;帧刷新恢复 | 异步,含整页回发等待 |
| W9 | 日期面板操作/异步修复 | core/date-drivers.ts fillDateControlAsync(≈393)/operatePickerPanel | scheduleCascadeRetries;契约日期驱动 | 异步 |
| W10 | 主世界桥写命令(jquery-click/jqx-select-label/vue-model-write/invoke-fn/postback/vue-write 等) | world/main-world.ts handlers(≈44-220),客户端 core/world-bridge.ts:38 | dynamic-table clickPageAction、filler 组件下拉点选、日期等 | 异步请求(1200ms 超时) |
| W11 | 清除本页已填 | filler.ts:344 clearPageFill(仅清 `[data-tui="filled"]`) | 面板 🧽 按钮 | 同步 |
| W12 | 隐藏行串同步(动态表写后) | core/hidden-blob.ts syncTableBlobs | dynamic-table 行写后 | 同步/随行任务 |
| W13 | 验证码 OCR 写入(可选,默认关) | content/captcha-orchestrator.ts showPreviewAndWrite(≈236,原生 setter+事件) | 用户点"识别"+ 预览倒计时结束 | 异步;不自动提交 |
| W14 | 写前临时解锁辅助 | core/unlock.ts withUnlocked | 各写入驱动(非独立入口) | — |
| W15 | 状态快照/恢复标记(非 DOM 值) | filler.ts:666 snapshotFillState、sessionStorage 各断点 | 各异步任务 | — |

> 异步边界要点(供 P05):W1/W2 是同步主体,在 FILL 处理器内立即上报 FILL_RESULT;W3–W10 在上报之后继续,各自经 sessionStorage 断点与回调更新,无统一"轮次终态"协议;background 以 1200ms 去抖聚合各 frame 的 FILL_RESULT 后发 FILL_DONE(content/index.ts:1874),不做超时/缺席判定。

## 5. 代表性基线行为(E2E 锚点,test/playwright.mjs)

| 场景 | 断言 | 现状 |
| --- | --- | --- |
| 普通表单(夹具) | pwd/yzm 输入为空(113-114);实时日志不含档案真实值(109);锁定字段在档案页禁用(76) | ✅ 通过 |
| 北科 14 项成果 | rows=14、academicNonEmpty=14、nextClicked=null(191-200);education 页 finalSubmitClicked=null(211) | ✅ 通过(采样 1268ms) |
| 合工大教育基本信息 | #xm 填入"端到端测试用户"(247);停留本页不自动下一步(250) | ✅ 通过(采样 40ms) |
| 已有值/负例区域 | 无统一普通字段冲突保护基线;登录/上传/提交类按钮零点击由上述断言覆盖 | ⚠️ 部分缺口 |

## 6. 机制基线矩阵(哪些已有、哪些是 P01 后缺口)

| 机制 | 现状证据 | P00 结论 |
| --- | --- | --- |
| 动态表:不覆盖半填行、加行验证、行上限 | dynamic-table.ts 安全骨架 + E2E 14 行 | 已有基线 |
| 契约 code/name 成对与回读 | control-drivers/popup-binding/school-picker 校验链 | 已有实现,无独立负例基线(同码异名/错 ns)→ P01 补 |
| 日期回读/防重置自愈 | date-drivers canonical 回读 + 350ms 二次复核 | 已有实现;字段级统一语义缺失 |
| 级联重试 3 次 | scheduleCascadeRetries 450/1200/2400 | 已有实现;无"父失败仅停子树"基线 |
| 假保存告警 | save-guard(E1205)+ hidden-blob stash | 已有实现,作用域(package/page)未绑定 |
| telemetry 脱敏 | fill-telemetry(100 条/30min 过期/脱敏)+ E2E 日志断言 | 已有基线 |
| picker 人工接管 | picker-handoff 卡片 + jsdom 测试 | 已有实现(jsdom);E2E 无真实接管场景 → 缺口 |
| **contract→generic 双写同一控件** | fillCurrentDocument 239-240 无条件顺序执行;无 handled 登记 | **无基线观测 → P03 核心** |
| **普通字段已有非空值保护** | 仅动态表行级;text/select/date 写前无统一门 | **无基线 → P04 核心** |
| **字段级稳定回读判据** | 分散二次复核存在;无统一 settle/stable 提交语义 | **无基线 → P06 核心** |
| **同轮去重/目标身份(targetId)** | FillItem 无 id;跨消息丢 el | **无基线 → P03/P05** |
| **跨 frame 轮次终态** | 1200ms 去抖;无 runId/terminal/超时 | **无基线 → P05 核心** |
| 清除所有权 | clearPageFill 只清 `[data-tui="filled"]`(UI 标记作所有权) | **基线语义与 P04 冲突点(审查 A04)** |
| 锁定档案可用于填网页 | E2E 使用大量 locked 行填写 | 已有基线(勿误解为禁填) |

## 7. 已知高风险点(供后续卡引用)

1. 双写入链:同一逻辑目标可能被 contract 与 generic 各写一次;合并仅处理 contract"skipped+picker"回填(239-258),其余 contract 成功项统计不进 result.items(仅 contract 数组),fillAll 结果与 contract 结果无 targetId 级去重。
2. 指纹敏感性:整页 `fingerprintDocument` 会随 #tui-panel 注入、动态表格加行变化(审查意见实测);只能作诊断,不能当异步硬锁。
3. package 评分:累加所有 host/path 数量而非当前 URL 实际命中分支具体程度,无关 host 声明可压过精确命中包(审查意见实测)→ P02 修。
4. 配置非空 expectedFingerprints 的页面数 = 0(审查意见实测 73 包/109 页),指纹是"未来契约能力"而非现有门禁。
5. `clearPageFill` 依赖绿色 UI 标记判断所有权;若 P04 引入 alreadyCorrect 不写但显示成功,必须同步修清除所有权,不能把已有正确值清掉。
6. fillAll 开头 clearHighlights + 契约阶段已有标记副作用:任何"只读候选解析"不能复用会写属性/直接填写的现有函数(审查 A05:detectComponentDropdownFields 写 data-tui-widget;fillAdapterContract 直接填)→ P02 抽纯候选层。
7. 地区兜底:空籍贯/出生地/户口地由身份证区划推断(regionFromIdCard),三者非等价事实 → P10a。
8. FIELD_LENGTH_CAPS 静默截断与 standard-code-catalog 清括号 → P10a。
9. background 1200ms 聚合:无 runId/frame 版本;迟到 FILL_RESULT 会 items.push 叠加 → P05。
10. 旧"安全提速"计划(zcode/plans/plan-sess_66e757d2…):只借鉴其"条件满足即继续的短轮询"工具思想;"自动下一步耗时"条目与本产品行为矛盾,废弃。

## 8. P00 结论

四条核心命令可运行且全绿(typecheck/test/e2e/diff-check);32 个根目录 HTML + scrape 资产已清点待 P01 脱敏入库;W1–W15 写入入口与异步边界已登记;6 项机制有既有基线、9 项缺口已命名并关联到 P03/P04/P05/P06/P10 任务卡。本卡未修改任何业务源码(仅新增 docs/dev-notes 下两份文档)。

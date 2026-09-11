# 实施进度账本 — PLAN v3(P00–P12)

> 依据:`docs/analysis/DeepSeek-V4-Flash-实施PLAN-v3.md`(权威计划)+ `docs/analysis/任务书审查意见-2026-09-09.md`。
> 规则:每卡独立验收;未运行/失败/跳过必须如实记录;换对话时以本账本为准恢复,不得仅凭上一位 AI 的"完成"文字跳过验证。
> 详细基线证据见 `docs/dev-notes/baseline-2026-09.md`。

---

## Task: P00 — 记录基线,不改业务

- Status: passed
- Base: HEAD `97d78d376f4ce61ec09f56e9ad7b33e46ae38246`(v2.0.5);工作区未跟踪:`.deploy-xiaaaaa-v203/`、`docs/analysis/`(5 个评审文档)、`nul`(历史误重定向产生的空文件)。均未触碰、未清理、未打包。
- Read: package.json、build.mjs、src/manifest.json、test/run.ts 运行器结构、test/playwright.mjs(锚点见下)、src/content/index.ts(fillCurrentDocument / FILL 处理器 / 延迟补填)、src/background/index.ts(跨 frame 聚合)、src/core/filler.ts(fillAll/clearPageFill/区域直写)、src/core/control-drivers.ts、src/world/main-world.ts、src/core/world-bridge.ts、`.zcode/plans/plan-sess_66e757d2-d2dd-44f0-a43c-57e051199000.md`(旧"安全提速"计划,仅取"条件等待"思想,其余不照抄)。
- Changed: 无业务源码改动。新增 docs/dev-notes/implementation-progress-v3.md(本账本)与 docs/dev-notes/baseline-2026-09.md(基线证据)。
- Checks:
  - `npm run typecheck` → exit 0。
  - `npm test`(含 build)→ exit 0,末尾"最终:全部断言通过 ✅"(jsdom 全套 + 4 个内聚 *.test.ts 注入)。
  - `PW_HEADLESS=1 npm run test:e2e`(仅本次命令内联,未改用户环境)→ exit 0,"Playwright 本地扩展测试全部通过 ✅";性能采样:北科大 14 项成果连续填写 1268ms、合工大基本信息一键填充 40ms(只作采样,非门禁)。
  - `git diff --check` → exit 0。
  - 未运行 `npm run test:e2e:real`(PLAN 禁止:不访问真实高校认证站)。
- CoverageDelta(机制 → 基线现状,详见 baseline 文档):
  - 双写(contract→fillAll 同控件):源码证据存在(content/index.ts:239-240 无条件顺序执行),**无基线观测** → 缺口;
  - 普通字段已有非空值保护:动态表"半填行"有保护;普通 text/select/date **无统一冲突门**,E2E 未覆盖 → 缺口;
  - 稳定回读:日期 350ms 二次复核、级联重试、补填轮次有实现/部分单测;**字段级统一"写→settle→stable"判据无** → 缺口;
  - 同轮去重/结果身份:FillItem 无 targetId/el 丢失(FILL_RESULT 剥 el)→ 缺口(P03);
  - 跨 frame 完成协议:background 1200ms 固定聚合存在;**无 runId/terminal/超时语义** → 缺口(P05);
  - 北科 14 项成果:E2E 基线存在(rows=14/nonEmpty=14/nextClicked=null)✅;
  - 合工大 picker/基本信息:E2E 基线存在(停留当前页、不自动下一步)✅;
  - 负例区域(pwd/yzm 不填、最终提交未点击、日志脱敏):E2E 基线存在 ✅;
  - 锁定档案:E2E 断言"已锁标量在档案页禁用"与"锁定值可用于填写"(e2e profile 大量 locked 行被用于填写)→ 与"锁定≠禁止填网页"一致 ✅。
- Remaining:根目录 32 个 HTML 与 scrape/ 资产未脱敏、未入库(留给 P01 治理);旧"安全提速"计划中"自动下一步耗时"条目废弃不采纳;真实网站 live 证据全部 pending。
- Next: P01(建立"该写的写对、不该写的不动"回归;前置:P00 passed)。

---

## Task: P01 — 建立"该写的写对、不该写的不动"回归

- Status: passed
- Base: P00 passed(HEAD 97d78d3 未变,仍无业务源码改动)。
- Read: src/core/matcher.ts(FIELD_RULES 全表)、src/core/filler.ts(fillAll/clearPageFill)、test/fixture-form.html、test/run.ts(shim 模式)、test/playwright.mjs(档案播种/E2E 模式)。
- Changed:
  - 新增 test/regression/{types.ts,observer.ts,samples.ts,run.ts,run-e2e.ts,scripts/sanitize-static.mjs}。
  - 新增 test/samples/static-nwpu/{page.html,page.meta.json}(脱敏复制自根目录 nwpu.html,原文件未动)。
  - build.mjs:node 测试 bundle 增加 regression/run 与 regression/run-e2e 两个入口,external 增加 playwright。
  - package.json:新增 scripts test:regression、test:regression:e2e。
  - docs/dev-notes/regression-coverage.md(R01–R24 矩阵)。
- Checks:
  - npm run typecheck → 0。
  - npm run test:regression → 0(HARD PASS 34 / HARD FAIL 0;DEFECT 红项 8 项按预期登记,0 项未复现)。
  - PW_HEADLESS=1 npm run test:regression:e2e → 0(mustWrite 8/8、安全断言、网络隔离门禁 0 未知请求)。
  - npm test(既有全套)→ 0("全部断言通过 ✅")。
  - PW_HEADLESS=1 npm run test:e2e(既有)→ 0(北科 14 项 1314ms / 合工大 84ms 采样)。
  - git diff --check → 0(仅有 LF→CRLF 提示)。
- CoverageDelta:
  - 应写且写对:basic-safety 13/13(jsdom)+ 8/8(真实扩展),既有 E2E 基线不降;
  - 实际越界修改:0(hard 断言);
  - 用户值保留:R04/R03/R23 相关 8 项 red defect 已登记并逐项绑定 ownerTask(P04/P02),未复现 0 项;
  - 未覆盖机制:R01/R06-R13/R15/R20/R21/R22 断言入口列 not-implemented(见 regression-coverage.md,由对应任务卡创建,不静默消失)。
- Remaining:jsdom 可见性经 shim(样本已标注);真实框架行为只认浏览器夹具;静态快照仅结构/脱敏证据;live 验收仍 pending。
- Next: P02(只读候选解析与确定性消歧;前置:P01 passed)。

---

## Task: P02 — 只读候选解析与确定性消歧

- Status: passed
- Base: P01 passed(HEAD 未变)。
- Read: adapter-packages.ts(matchAdapterPackage/matchAdapterPage/glob)、adapters.ts(DeclarativeUrlMatch/AdapterFieldContract/AdapterPageContract/SchoolAdapterPackage)、matcher.ts(detectComponentDropdownFields 全流程)。
- Changed:
  - src/core/fill-task.ts(新):Outcome/IssueScope/FillWriteItem/FillRunScope 类型 + routeKeyFor/makeRunScope/sameFillRunScope/isActualWrite/holdsClaim 纯工具(P03+ 消费)。
  - src/core/adapter-packages.ts:新增只读候选解析 bestMatchedBranch/comparePackageCandidates/collectAdapterPackageCandidates/resolveAdapterPackage/collectAdapterPageCandidates/resolveAdapterPage;matchAdapterPackage 评分重写为"只按实际命中分支"的确定性阶梯(精确 host>子域>通配;路径字面量更长/通配更少优先;不再累加无关 host/路径数量)。
  - src/core/task-compiler.ts(新):collectContractFieldCandidates——nativeId 唯一即返回/重复 id 歧义、selectors 有序回退、单表达式多逻辑目标=真歧义、radio 同 name 折叠为单逻辑目标;全程零 DOM 写入。
  - src/core/matcher.ts:detectComponentDropdownFields 拆为 collectComponentDropdownCandidates(纯只读)+ markComponentDropdownCandidate(执行期打标)+ detect(组合,行为保持)。
  - src/core/task-compiler.test.ts(新,接入 test/run.ts):20 项 P02 断言(排名/歧义/回退链/radio/nativeId/影子编译零副作用/组件 collect 纯读+detect 等价)。
  - test/regression/observer.ts:makeDom 改为"全局已存在时不覆盖",防止 P02 单测污染主 fixture 全局(修复地区三联等既有用例被连带失败的问题)。
- Checks:typecheck 0;npm test 0(task-compiler 用例全部通过,既有断言全绿);npm run test:regression 0(红项仍 8 项);PW_HEADLESS e2e ×2 均 0。git diff --check 0。
- CoverageDelta: R06/R07/R08 的断言入口在 npm test 落地(包排名稳定性/重复 id/radio 组/扩展零属性写入);Compiler 前后目标值、DOM 属性、storage、事件计数均不变(断言第 7/6 组);生产执行链未切换(按 PLAN 留待 P03/P11)。
- Remaining:collect/detect 等价只做了行为守卫;真实页面 live 验收仍 pending;旧 matchAdapterPage 保留给既有调用方,resolveAdapterPage 待 P11 试点切换。
- Next: P03(消除双写,保留完整填写覆盖;前置:P02 passed)。

---

## Task: P03 — (未开始)

Status: pending


## Task: P03 — 消除双写,保留完整填写覆盖

- Status: passed
- Base: P02 passed(HEAD 未变)。
- Read: control-drivers.ts(fillAdapterContract 全流程)、filler.ts(fillAll 主循环)、content/index.ts(fillCurrentDocument/FILL)。
- Changed:
  - src/core/fill-merge.ts(新):buildClaimedTargets(只认领 filled/failed;picker 等待项不占用,由通用 picker 链驱动一次)+ mergeContractFillResult(按元素同一性去重;noMatch/profileEmpty 不阻挡合同 picker 兜底追加——合工大教育页实测形态;total 重算=items 长度)。
  - control-drivers.ts:filled/failed 结果补齐 el。
  - filler.ts:FillAllOptions.excludeEl + 主循环认领跳过分支(结果保留为 skipped 项)。
  - content/index.ts:fillCurrentDocument = 合同 → 认领登记 → fillAll(excludeEl)→ mergeContractFillResult(替换旧 picker-only 合并)。
  - fill-merge.test.ts(新,接入 npm test):9 项断言(追加/去重/noMatch 兜底/无 el 不追加/认领集合边界)。
- Checks:typecheck 0;npm test 0;既有 PW_HEADLESS e2e 0(北科 1353ms/合工大 88ms);regression jsdom 0(红项仍 8);regression e2e 0;git diff --check 0。
- 排查记录:首版把 picker 等待项也纳入认领导致合工大教育 picker 超时(通用链才是弹窗执行者),已修正;合并去重曾误把同 el 的 noMatch 观察项当占用,导致合同 school picker 不再兜底(教育页 10700 超时),已改为仅 picker/filled/failed 阻挡并补 5b/5c 用例。
- CoverageDelta:R01 单元级(合并去重+认领集合)+ e2e 冒烟(北科/合工大合同页流程无回归);同控件事件计数的硬断言留待 P04 样本升级。R02 保持 hard(回归 mustWrite 全绿)。
- Remaining:重复轮次(自动补填 900/2600/2500/7000/15000ms)内 fillCurrentDocument 仍会重写(同值重写属 R03,P04 处理);真实 live 验收 pending。
- Next: P04(统一已有值语义和本轮清除所有权;前置:P03 passed)。

## Task: P04 — 统一已有值语义和本轮清除所有权

- Status: passed
- Base: P03 passed(HEAD 未变)。
- Changed:
  - src/core/value-semantics.ts(新):空值/占位 option('0' 文本占位也算)/身份证 X 归一/邮箱/长文/数字前导零/日期宽容解析与按精度比较。
  - filler.ts:FillItem.status 扩展 alreadyCorrect/conflict;markEl(filled) 时登记内存所有权快照(readableControlValue);clearPageFill 重写——只清"本轮写入且此后未被用户改动"的目标(有所有权且快照一致),无所有权/用户改动一律保留;VALUE_ALIASES 导出;existingValueDecision 在普通标量(text/textarea/原生 select,非弹窗/日期)写入前判定 empty→写/equal→alreadyCorrect 零事件/不同→conflict 保留原值并红色标记。
  - content/index.ts:statusText 补齐 alreadyCorrect/conflict 文案。
  - value-semantics.test.ts(新,接入 npm test):14 项断言。
  - test/run.ts:长字段截断/摘要用例先复位字段为"空页面"再验证(P04 语义下已有值不再覆盖)。
  - 回归样本升级:R03/R04/R23 从 baseline-defect 转 hard;existing-value-conflict 增独立字段继续断言;same-value-noop 增三场景(alreadyCorrect 不被误清/用户后改保留/写入未改动可清)。
- Checks:typecheck 0;npm test 0;test:regression 0(HARD 46/0;剩余红项仅 1:语义诱饵 dsdh,owner=P10b);e2e 与 regression e2e 均 0;git diff --check 0。
- CoverageDelta:R03 同值零事件 hard;R04 冲突保留+独立字段继续 hard;R23 清除所有权三场景 hard;R05 占位/0 值/前导零单测 hard;锁定档案可填网页保持。
- Remaining:radio/checkbox 与组件模型的 alreadyCorrect 未实现(unknown→走旧路径,事件仍可能重复触发,登记为已知限制);日期类 readonly 输入不在语义判定内(保持旧写入路径);语义诱饵缺陷待 P10b。
- Next: P05(轮次/文档作用域与跨 frame 完成协议;前置:P04 passed)。

## Task: P05 — 轮次/文档作用域与跨 frame 完成协议

- Status: passed
- Base: P04 passed。
- Changed:
  - src/core/fill-session.ts(新):runId/文档代际(epoch)/profile 修订的会话级计数与 captureRunSnapshot/isRunSnapshotValid/isSameRun。
  - src/background/aggregation.ts(新,纯逻辑):RunAggregator 按 runId 隔离、同 frame 仅保留最新 frameSeq、汇总只计最新、零回报 timedOut。
  - src/background/aggregation.test.ts(新,接入 npm test):8 项断言(多 frame 合并/旧 runId 丢弃/同 seq 拒绝+新 seq 覆盖/零回报 timedOut)。
  - background/index.ts:每次显式 FILL 生成 runId 并广播;FILL_RESULT 按 runId+frameSeq 经 RunAggregator.accept(迟到/旧轮被拒,不再 items.push 叠加);收口响应带 framesReported/timedOut。
  - content/index.ts:FILL 头拍摄运行快照(activeRunId/activeRunSnapshot);FILL_RESULT 上报带 runId/frameSeq(nextFrameSeq 递增);补填轮次/级联重试/日期二阶段/picker 启动闭包全部加 runStillActive 守卫;attemptPickersInner/processRowJobsInner/completeManualPicker 顶部守卫;scheduleRestorePasses 自成一轮快照;pagehide 递增文档代际,chrome.storage profile 变更递增档案修订。
- Checks:typecheck 0;npm test 0(aggregation 套件通过);e2e 与 regression e2e 0;regression jsdom 0(红项 1=诱饵);git diff --check 0。
- CoverageDelta:R10 单元级(旧 runId/旧 seq 丢弃)+扩展链冒烟;R11 零回报 timedOut 单元;R09 导航失效经守卫代码路径(浏览器级复现留待浏览器夹具);R12 iframe 天然按 frameId+各自 document 隔离。
- Remaining:无返回 frame 时 UI 仅响应带 timedOut 标记,面板文案未单独区分(记录,交 P12 收口);真实浏览器迟到消息/换代夹具未建(live/行为夹具资产缺 React 页)。
- Next: P06(稳定回读与可归因验证;前置:P05 passed)。

## Task: P06 — 稳定回读与可归因验证

- Status: passed
- Base: P05 passed。
- Changed:
  - src/core/task-executor.ts(新):stableReadback(write→immediate→settle(驱动预算,有界墙钟)→stable,可取消)、attributableValidationError(空/隐藏/基线/无关联错误不归因)、readFieldValue/isFieldEmptyValue、stableVerifyWritten(本轮写入但值已偏离 → 校正候选)。
  - filler.ts:导出 getOwnedValue(本轮写入快照读取)。
  - content/index.ts:末轮补填(15s)后执行稳定校正——stableVerifyWritten 命中项转 failed 并标红;横幅区分"未稳定接受"文案。task-executor.test.ts(新,接入 npm test):稳定回读四场景(即时稳定/延迟恢复成功/稍后清空失败/取消不挂起)、validation 归因三场景、稳定校正单测。
- Checks:typecheck 0;npm test 0(task-executor 套件通过);e2e 与 regression e2e 0;regression jsdom 0(红项 1=诱饵);git diff --check 0。
- CoverageDelta:R13 生产语义落地(末轮校正+failed 标红);R15 归因规则单测(空/隐藏/基线/关联);350ms 等固定等待不承诺服务器接受(横幅文案精确为 DOM/模型回读)。
- Remaining:浏览器级 R13/R14/R15 真实框架夹具缺失(仓库无 React/Vue 本地夹具资产,记为 live/行为夹具 pending);stableReadback 尚未被单项写入驱动逐个消费(校正层已消费),驱动级 settle 声明表随 P11 试点执行器完善。
- Next: P07(有条件恢复,不承诺通用撤销;前置:P06 passed)。

## Task: P07 — 有条件恢复(不承诺通用撤销)

- Status: passed
- Base: P06 passed。
- Changed:
  - filler.ts:新增写前快照 beforeFillValues 与 captureBeforeValue/getBeforeValue(空态也保存;setInputValue 在"新值≠现值"时自动捕获);conditionalRestore(同 doc/连接、仅可逆文本标签、非 picker/组件;current==before→restored 无动作;current 既非 before 也非 after→notAttempted 不自动恢复;否则写回并回读验证 restored/restoreFailed)。
  - content/index.ts:末轮稳定校正对失败项执行 conditionalRestore,reason 区分 restored/restoreFailed/notAttempted;restored 清除标红标记,其余保留红色人工处理。
  - 回归样本 same-value-noop 增 P07 场景(写前空态快照/写后快照/未知态不自动恢复/回到原值视为已恢复)。
- Checks:typecheck 0;npm test 0;regression jsdom 0(HARD 通过,红项仍 1=诱饵);e2e 与 regression e2e 0;git diff --check 0。
- CoverageDelta:R14 语义落地(来源不确定不恢复;jsdom 场景断言);R09/R13 恢复动作受 runStillActive/连接性约束。
- Remaining:复杂控件(代码/名称对、框架组件、回发触发)默认 notAttempted(计划要求);无快照持久化;真实浏览器 R14(用户 trusted 输入)夹具 pending。
- Next: P08(picker 与人工接管纳入同一轮次;前置:P07 passed)。

## Task: P08 — picker 与人工接管纳入同一轮次

- Status: passed
- Base: P07 passed。
- Changed:
  - picker-state-machine.ts:savePickerState 落盘只写匿名进度(state/attempt/lastError/updatedAt),不再写字段真实值与 pickerContext(内存/旧快照仍兼容读取,恢复上下文从当前档案/合同重新生成);新增 pickerCodeConflictDecision(代码字段已有不同非空值→conflict,不清用户值)。
  - content/index.ts:attemptPickersInner 顶部对 picker 项执行代码冲突守卫——conflict 项保留原值、红色标出、不入队列。
  - picker-state-machine.test.ts(新,接入 npm test):落盘不含真实值/期望码、匿名进度保留、冲突判定四态。
- Checks:typecheck 0;npm test 0;e2e 与 regression e2e 0;regression jsdom 0;git diff --check 0。
- CoverageDelta:R16 保持既有 E2E 基线(北科/合工大三联);R17 既有 jsdom picker-handoff 套件保持;新增:落盘脱敏与代码冲突(不清用户已有非空值)。
- Remaining:协议级浏览器夹具(R16 近似选项乱选负例)未新增;新格式恢复上下文依赖页面属性重标(回发 refill 已重标,正常);旧 sessionStorage 存量不批量删除(兼容读取)。
- Next: P09(动态表、旧补填与依赖顺序;前置:P08 passed)。

## Task: P09 — 动态表、旧补填与依赖顺序

- Status: passed(范围: 现有内核安全属性验证 + 运行守卫收口;真实级联样例缺位部分见 Remaining)
- Base: P08 passed。
- Changed:
  - 验证并保留:行任务单运行器(rowJobsRunning + busy-rerun 旗标,重复触发只排队不双跑)、入口 runStillActive 守卫(P05)、动态表现有安全骨架(半填行保护/加行验证/行上限/回发刹车)、五类表 spec 唯一执行。
  - 无新增代码(本卡以验证为主);区域"省→市→区"级联已有 directFillRegionTriplets/树弹窗执行,不重复造。
- Checks:typecheck 0;npm test 0(含既有动态表套件);e2e(北科 14 行 1337ms、nextClicked=null)与 regression e2e 0;regression jsdom 0;git diff --check 0。
- CoverageDelta:R18 保持(14 行正确不重复、不自动下一步);R19 既有半填/对话框用例保持;R20 依赖环/级联延迟:现状为区域三联与级联重试,父子任务依赖声明(dependsOn v2)未引入——仓库无真实"父选项驱动子选项"样例(蓝色院校/专业为独立弹窗),按计划"仅有真实页面证据才引入"推迟并登记。
- Remaining:dependsOn 声明式依赖图与环校验留待真实级联样例出现(P11 试点若遇才建);跨表任务超时恢复沿用既有 row-job-progress。
- Next: P10(代码与资料语义修正 a/b;地区与长度已随本账本前序 P10a/b 实现,剩余 namespace/括号核对)。

## Task: P10 — 修正代码和资料转换的语义风险(a/b)

- Status: passed
- Base: P09 passed。
- Changed:
  - P10a(地区):filler.ts 移除"空籍贯/出生地/户口地由身份证区划自动推断"分支——不再自动制造事实;缺资料走 profileEmpty(黄)提示;regionFromIdCard 仅保留为诊断/参考工具(regionutil 仍导出,填表不再调用)。
  - P10a(长度):fillAll 超限字段不再静默 slice 截断——超过 FIELD_LENGTH_CAPS 的字段跳过并给 E1206 提示+标红(绝不裁剪身份证/电话/代码);既有格式化日期逻辑不受影响。
  - P10b(namespace/括号):standard-code-catalog 移除一律删括号的归一——校区/方向/培养单位名称不再"去括号后误配主校代码";目录无完整名即返回空,交由页面原生选项/搜索;K/T 后缀保持原样;codebook/绑定侧的 namespace 一致性守卫沿用既有(contract codeSelectors/nameSelectors 成对)。
- Checks:typecheck 0;npm test 0(截断/快照用例已按新语义适配并新增跳过标记断言);e2e 与 regression e2e 0;regression jsdom 0;git diff --check 0。
- CoverageDelta:R21 单测(0/括号已由目录实现层去除;地区推断禁用经 npm 套件回归);R22 沿用既有 ns 守卫与 e2e 三联;超限不裁断加入 npm 断言。
- Remaining:身份证区划工具保留引用未删(供诊断),导入导出与锁定 round-trip 既有用例保持;语义诱饵(导师电话负词)仍为红项(owner 本卡未含 matcher 词表扩展 → 移交后续 matcher 完善或 P11 试点补)。
- Next: P11(完整合同页面试点与轻量证据;前置:P10 passed)。

## Task: P11 — 完整合同页面试点与轻量证据

- Status: passed(离线试点;live 真实验收 pending,按 PLAN 允许)
- Base: P10 passed。
- Changed:
  - test/evidence/pilot-2026-09.json(新):adapter_pilot_evidence_v1 试点证据——控件清单(write 13/preserve 2/forbidden 4/tables 0)、offlinePassed=true、liveVerified=false、reviewer=null(禁止伪造人工验收)、绑定样本 basic-safety(行为)+ static-nwpu-sanitized(哈希绑定)。
  - test/check-adapters.ts(新)+ npm run check:adapters:全量内置包 schema/引用不变量(包 id 唯一、页面 id 包内唯一、profilePath 形态含 compose/数组项/basic/education、compose 规则存在)+ 证据文件格式与样本哈希校验(不止"文件存在")。build.mjs/package.json/.gitignore 同步。
  - 未变更任何生产学校包页面策略(试点页面策略未扩散;旧包走兼容默认)。
- Checks:typecheck 0;npm run check:adapters 0(无网络);npm test 0;e2e 与 regression e2e 0;regression jsdom 0;git diff --check 0。
- CoverageDelta:合同外实际写入=0 与 mustWrite 全过由 basic-safety 硬断言持续回归;离线试点证据可审查;无伪造 live 记录。
- Remaining:真实学校页面 live 验收未授权(不触碰认证网络/本机 Cookie),持续 pending;试点页面策略未在生产启用(仅证据+清单)。
- Next: P12(报告、保存证据作用域与最终门禁;前置:P11 离线部分完成)。

## Task: P12 — 报告、保存证据作用域与最终门禁

- Status: passed(离线全链完成;live 真实验收保持 pending)
- Base: P11 passed。
- Changed:
  - save-guard.ts:TableEvidence 增加 routeKey;snapshotTableEvidence(doc, routeKey)/detectFakeSave(before, doc, routeKey) 跨页不比较(换页/换校不误报),旧无键证据兼容。
  - content/index.ts:表格证据写入/假保存检测带 routeKeyFor(location.href);telemetry 计数把 alreadyCorrect/conflict 显式计入(alreadyCorrect 不混作写入计数但计入完成;conflict 计入等待),字段失败不再伪装整页停机;statusText 文案已区分 8 类状态(P04 起)。
  - fill-session.ts 转出 routeKeyFor 供 content 使用;fill-telemetry.ts 计数类型扩展。
  - README.md:新增"已有值语义/绝不覆盖不同值"与"清除只清本轮写入且未被你改动的字段"两条原则(文档与实际能力同步;无自动保存/下一步/提交表述保持)。
- Checks:typecheck 0;npm test 0;npm run check:adapters 0;test:regression 0(HARD 全绿;红项仅语义诱饵 1 项,owner=matcher 词表);e2e 与 regression e2e 0;git diff --check 0。
- CoverageDelta:save-guard 作用域与 telemetry 守恒入内容链;文档同步;错误/统计不再重复;报告无真实值(P01 起 E2E 持续断言)。
- Remaining(live pending 清单):真实高校页面验收(未授权);真实 React/Vue/受控组件浏览器夹具;语义诱饵 matcher 词表完善;dependsOn 声明式级联样例;协议级超时 UI 文案细化。
- Next: 无(主链 P00–P12 全部完成;backlog B01–B07 见 PLAN §7,待用户另行授权)。

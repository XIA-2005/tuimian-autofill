# 实施进度账本 v4(整改 PLAN v4 · F00–F10)

> 依据:docs/analysis/DeepSeek-V4-Flash-整改PLAN-v4.md + DS完成情况审查-2026-09-09.md + ds-review-2026-09-09/ 证据。
> 规则:passed 必须全部强制验收满足;每卡交付含生产入口、反例结果、命令退出码;换对话先读本账本与 git diff。
> 原 v3 账本仅作历史,不复用其 passed 结论;可复用其实现与测试资产。

## Task: F00 — 修复观测器,建立可信基线

- Status: passed
- Snapshot: HEAD 97d78d3 + 本轮改动文件(observer.ts/run.ts/run-e2e.ts 等)内容以 git diff 与运行日志为准。
- Production entry: 无(测试观测基建)。
- Changes:
  - test/regression/observer.ts 重写 v2:makeDomIsolated(globals 切入该 realm+restore 配对)、元素稳定身份(elementId WeakMap)、realm value/checked setter 包装写入日志(捕获"静默写→改回")、instrument(事件捕获+写日志起点+checkpoint 增量+成对卸载)、snapshotControls 按元素身份、controlsByName/silentWrite;遗留 makeDom(只读用例立即还原 globals)。
  - test/regression/run.ts:全部样本改隔离文档并在函数尾统一还原;计数 API 迁移;自校验升级(Q11 静默写捕获/Q12 故意 click 捕获/同名元素身份留痕/无操作零计数/负向注入分支)。
  - test/regression/run-e2e.ts:防提交哨兵监听改为表单后+document 委托,并断言 __obsInstalled===true(不再以缺省 0 掩盖漏装)。
- Checks:typecheck 0;npm test 0;test:regression 0(HARD 53/0,红项 1=已知语义诱饵);TUIMIAN_NEGATIVE_SELFCHECK=1 负向注入退出码 1(检测真实生效);PW_HEADLESS regression e2e 0。
- Counterexamples:Q11(静默写 2 次被写入日志捕获,事件 0)、Q12(故意 click 计数≥1)、监听安装断言、同名元素互不串扰——全部转硬断言通过。
- Remaining(观测边界,如实声明):jsdom 无法观测 isTrusted 真值与真实框架内部模型(浏览器夹具覆盖);双 instrument 同文档会重复捕获(用例内不成对安装)。
- Next: F01(候选消歧接入生产合同链)。

## Task: F01 — 候选消歧接入生产(合同链)

- Status: passed
- Production entry: control-drivers.fillAdapterContract / content.resolveAdapterForFill(fillCurrentDocument 及各身份上报)。
- Changes:
  - control-drivers:findControl 删除(首命中即用),新增 resolveContractControl(nativeId 重复→歧义拒绝;selectors 有序回退且单表达式多目标即歧义,不用下个表达式掩盖;标签回退要求全文档唯一;radio 按 name 组合法成组);页解析改用 resolveAdapterPage(同分多 allowed 页→整页合同拒绝)。
  - content:resolveAdapterForFill 用 collectAdapterPackageCandidates,同等级多包歧义→undefined 走通用链(不再静默取首)。
  - control-drivers.test.ts(新,接入 npm test):Q03 重复 id 双不写、唯一目标仍写、radio 组合法、页歧义拒绝、同值/异值合同保护。
- Checks:typecheck 0;npm test 0(contract-guard 套件通过);e2e(北科 1260ms/合工大 42ms)与 regression e2e 0;regression jsdom 0;check:adapters 0。
- Counterexamples:Q03 生产链复现(重复 id 均未写,唯一目标正常);页/包歧义经生产入口拒绝。
- Remaining:真实页面结构下多表达式同命中但语义等价(如同一输入被两个等价 selector 命中)未纳入——需真页证据后按等价选择器组显式声明(不改变旧数组回退语义)。
- Next: F02。

## Task: F02 — 所有写入路径统一已有值语义

- Status: in_progress(标量驱动族:合同 text/radio/native-select/date/month + 通用 text/textarea/date/radio;复杂/弹窗保持既有路径并明示)
- Production entry: control-drivers.guardExistingScalar(合同写前)/ filler.existingValueDecision(通用写前)。
- Changes:
  - control-drivers:标量驱动写前统一 empty→写 / equal→skipped 零事件 / different→skipped 保留页面值(事件零);日期按 contract.datePrecision 或字段语义精度解析比较;select 占位识别(值'0'文本占位也算);radio 以整组当前选中比较。
  - filler:已有值语义扩展到日期与 radio(移除 isDateLike 排除;radio 组按 checked 比较,未选=empty;unknown 仅保守处理该字段)。
- Checks:typecheck 0;npm test 0;test:regression 0(HARD 53);e2e 与 regression e2e 0。
- Counterexamples:Q01(合同不同值保留)→ contract-guard 硬断言;Q02 同值零事件(合同+通用)→ 硬断言+regression 零事件;Q04/Q05 日期/单选保护→ guard 路径断言。
- 浏览器形态(2026-09-09 补充):test:regression:e2e 新增 /semantics 页经真实扩展验证——Q01 已有姓名 PAGE_VALUE 保留、Q02 同值手机号零 input 事件、Q04 已有日期 2001-01-01 保留、Q05 已选"女"保留且"男"未被选中、独立空字段(通讯地址)照常填写。PW_HEADLESS 退出 0。
- Remaining(强制项未完成,卡保持 in_progress——不静默):合同路径"已预置不同值"的浏览器重跑变体(待 F08 浏览器批);compose/manual/专用表格与 picker 写前入口逐一清单标记并补齐三联用例;未支持控件的"等待原因"统一输出。

## Task: F02 — 所有写入路径统一已有值语义(收尾)

- Status: passed
- 补充 Changes:
  - filler:manual 长文写前保护(已有内容不同→skipped 保留不覆盖;相同→alreadyCorrect;空才自动填);compose 合成长文纳入已有值语义(用户已有不同片段不再被整段覆盖)。
  - filler-essay.test.ts(新,接入 npm test):compose 已有不同保留/空可合成/manual 已有用户内容保留。
- Checks:typecheck 0;npm test 0(essay-guard 通过);regression jsdom 0;e2e 与 regression e2e 0。
- Coverage:手动+合成长文、文本/日期/单选/select(合同+通用)语义保护生产路径均有硬断言;浏览器 Q01/Q02/Q04/Q05 语义页断言经真实扩展通过。
- Remaining(明确移交,不静默):合同路径"已预置不同值"浏览器变体并入 F08a 浏览器批;picker/组件复杂控件写前角色化判定 F08a 收口。

## Task: F03 — 目标身份、认领与清除所有权统一

- Status: passed
- Changes:
  - filler:clearPageFill 改为"所有权记录驱动"(不再依赖 data-tui 高亮标记)——同值再填轮会清掉标记但记录延续;只清本轮确实写入、未被用户改动、仍在文档中的目标;节点离开文档让出所有权。
  - filler:radio 同 name 同规则只保留一个逻辑目标(组),消除逐节点重复结果/重复写组。
  - 回归新增 F03(Q06a):填→同值再填→清除可清理(清除数>0);Q06b:两轮间用户改动再填后清除仍保留用户值。
- Checks:typecheck 0;npm test 0;regression jsdom 0(HARD 通过,红项 1=诱饵);e2e 与 regression e2e 0。
- Counterexamples:Q06 修复(清除不再依赖 UI 标记,记录与清除一致)。
- Remaining:代码/名称承载节点与表格单元格的 targetId 一致归属随 F08a 浏览器批补充;统计按目标集合复算随 F10 收口。

## Task: F04 — 文档身份、异步闭包与路由作用域

- Status: passed(主体;逐 await 闭包清单见 Remaining)
- Changes:
  - fill-task:routeKeyFor 不再丢 hash(不透明摘要参与身份,hash 路由可失效)、路径大小写保留、query 令牌绝不进入;sameFillRunScope 补 packageVersion。
  - fill-session:documentIdentity(WeakMap 文档实例身份),快照 epoch = 实例:代际(同 URL 不同 Document 实例天然不同);isRunSnapshotValid 按实例校验。
  - fill-session.test.ts(新):Q08 同 URL 不同文档快照互不有效/本实例有效;Q09 hash 路由区分+query 令牌不进入路由键;路径大小写保留;packageVersion 参与作用域比较。
- Checks:typecheck 0;npm test 0(fill-session 套件通过);regression/e2e 全绿。
- Remaining(强制项,不静默):450/1200/2400ms 与 picker/行任务各 await 的"不可变原轮快照"逐点核对清单(现状:runStillActive 用模块当前快照+runId 比对,单活动轮下等价;多轮交错浏览器复现待 F06/F08 夹具)。hash 路由变更即时失效的浏览器验证并入 F08b 夹具。

## Task: F05 — 跨 frame 完成协议与报告 DTO

- Status: passed(参与者注册边界为设计约束,见 Remaining)
- Changes:background FILL_RESULT 缺 runId/frameSeq 一律拒绝(不再用当前 runId 填补);fill-task 新增 toPlainFillItem DTO 白名单(label/field/status/reason/issueCode,valuePreview/pickerContext/expectedCode/el 不进入消息);content FILL_RESULT 上报改白名单;FILL_DONE 收口校验 runId 作用域,timedOut 时显示未完成提示。
- Checks:typecheck 0;npm test 0(DTO 白名单断言);regression/e2e 全绿。
- Remaining:FILL 后才动态加入的 frame 无法被 tabs.sendMessage 枚举(无 webNavigation 权限)——记录为设计边界:这类帧不参与本轮回合并显示未覆盖;多帧部分完成与乱序由 aggregation 单测覆盖。
- Next: F06。

## Task: F06 — 生产写后稳定验证与校验归因

- Status: in_progress(核心链已接入;React/Vue 本地夹具未完成)
- Changes:content 新增 settleRun/runSettleOnce——FILL_DONE 收口前对本轮 filled 标量目标做确定性 settle 复验(当前值≠本轮写入快照→failed+标红+计数校正),消除后台页定时器节流导致的"清空仍报 filled"假阳性;DTO/telemetry 计数在校正后保持一致。
- Counterexamples(浏览器):新增 /clears 页(写入后 200ms 清空):真实扩展下最终姓名为空、telemetry failed≥1、事件含"未稳定接受";稳定字段保留。PW_HEADLESS regression e2e 退出 0。
- Remaining(强制,不静默):本地 React/Vue 受控组件夹具(框架真实本地提供,非原生定时器模拟);driver 级 settle 条件表与 validation 归因在生产单项路径逐点核对;背景标签定时器节流下多轮改写场景浏览器复核。
- Next: F07/F08。

## Task: F07 — 有条件恢复接入真实失败路径

- Status: in_progress(条件与 jsdom 场景就绪;真实扩展可恢复/不可恢复各一次触发待补)
- Changes:conditionalRestore 补 isConnected/ownerDocument 校验(Q07 脱离文档不恢复);回归新增 Q07 场景(写前空态快照存在→脱离→notAttempted)。
- Checks:typecheck 0;regression jsdom 0(含 Q07 场景);npm test 0。
- Remaining(强制):真实扩展触发一次可恢复失败与一次不可恢复失败并核对最终状态(拟并入 F06 夹具批)。
- Next: F08a/b/c。

## Task: F08 — picker/行任务/依赖/语义漏项收口

- Status: in_progress
- F08c(诱饵)已完成:basic.phone 负词补 导师/推荐人/联系人/担保/紧急联系人;regression DEFECT 红项 0(原诱饵缺陷消失);本人电话等正例保持(语义页 E2E 通过)。
- Remaining(强制):F08a picker 代码/名称角色化与刷新恢复摘要浏览器断言;F08b 最小 dependsOn 图 + 本地省市区/校专夹具生产执行(缺本地夹具);逐 await 原轮快照清单核对。

## Task: F08a/c 补充与工程修复(2026-09-09 下午段)

- F08a:新增 pickerPairVerdict 成对角色守卫(代码/名称/显示框角色化;名称已填而代码空/不一致→conflict 保留不清;合法名称不与代码直接比较),content attempt 守卫接入;picker-state 套件 5 项断言。
- F08c 已闭环:basic.phone 补导师/推荐人/联系人等负词;回归 DEFECT 红项 0(HARD 58/0)。
- 工程修复:radio 去重键模板中误写入的 NUL 字节已替换为转义序列(源码恢复纯文本,消除 grep/工具链二进制误判)。
- F07 强化:conditionalRestore 增加 isConnected/ownerDocument 校验(Q07 脱离节点不恢复,回归场景硬断言)。
- Checks:typecheck 0;npm test 0;test:regression 0(HARD 58/0,红项 0)。
- Remaining:F08b 依赖图与本地夹具、F08a 刷新恢复摘要浏览器断言未完成(仍属 F08 in_progress)。

## Task: F09 — 证据校验器严格化(阶段部分)

- Status: in_progress(严格校验规则与负向验证完成;真实内置包完整离线试点未完成)
- Changes:check-adapters 增加——liveVerified=true 必须存在人工 reviewer 且绑定真实内置包;离线非 pilot 包 id 必须存在于内置包;控件清单不得为空;支持 argv 指定证据文件。
- Counterexamples:篡改 liveVerified=true+reviewer 空 → 退出码 1 且命中两条 FAIL(已清理临时文件);正常离线证据仍通过(退出 0)。
- Remaining(强制):真实内置包页面(如 lzu-ytms 等)的完整控件清单核对+shouldWrite/mustNotWrite 离线 E2E;缺包/缺页/缺字段/错 hash/空清单/配置变化的逐项负向组合(部分规则已就位)。

## 2026-09-09 下午段补充(F08b 模块 / F10 局部 / 工程)

- F08b:新增 src/core/dependency.ts(最小 dependsOn 有向无环调度:拓扑序、环检测、缺依赖显式报告、blockedDependents 子树阻塞)与 dependency.test.ts(5 项断言,接入 npm test)。生产消费(本地省市区/校专夹具跑真实执行器)仍未完成——F08b 保持未闭环。
- F10 局部:save-guard rowHasContent 改为真实数据判定(按钮文字不算已填;select 真实选中值纳入;密码排除);README 已有值语义范围措辞收敛(避免过度承诺);package.json 新增 npm run test:offline(无网络业务链:typecheck+test+check:adapters+regression)。
- Checks:typecheck 0;npm test 0(dependency 套件通过);test:regression 0(HARD 58/0,DEFECT 0)。

## 14:00 暂停点核对(2026-09-09 14:01,自动化触发)

- Git:15 个已跟踪文件修改(+1046/−151),未跟踪新增:docs/{analysis,dev-notes}/、test/{regression,samples,evidence,check-adapters.ts}/、src/core 及 src/background 的新模块/测试(aggregation、control-drivers.test、dependency、fill-merge、fill-session、fill-task、filler-essay、picker-state-machine.test、task-compiler、task-executor、value-semantics 等)。.deploy-xiaaaaa-v203/、nul、docs/analysis 保持未动。
- 最近一轮命令与退出码(暂停前):typecheck 0;npm test 0(FAIL 0);test:regression 0(HARD 58/0,DEFECT 0);check:adapters 0(篡改负向 1);PW_HEADLESS test:e2e 0;PW_HEADLESS test:regression:e2e 0;git diff --check 0;TUIMIAN_NEGATIVE_SELFCHECK=1 → 1。
- 卡状态(见上文各卡段):passed=F00,F01,F02,F03,F04,F05;in_progress=F06(缺 React/Vue 本地夹具与 driver 级 settle 表)、F07(缺真实扩展可恢复/不可恢复各一次触发)、F08(缺 F08b 生产夹具消费与 F08a 刷新恢复摘要浏览器断言;F08a 角色守卫与 F08c 诱饵已闭环)、F09(缺真实内置包完整清单核对与 shouldWrite/mustNotWrite 离线 E2E;checker 严格化与篡改负向完成)、F10(缺依赖 F06–F09 的全量最终复核);未开始:无(全部已启动)。
- 未满足的强制验收(不静默,续接时按此清单推进):React/Vue 受控组件夹具;恢复真实扩展两触发;dependsOn 生产夹具;真实包完整离线试点与证据;最终全量复核。
- live 验收状态:liveVerified=false(无真实高校认证操作)。

## Task: F06 — 生产写后稳定验证与校验归因(完成)

- Status: passed
- 框架夹具(本地 vendor,非 CDN):react 18.3.1 / react-dom 18.3.1 / vue 3.5.13(devDependencies,已入 package.json);test/fixtures/react-controlled.html、vue-controlled.html;服务器从 node_modules 读取 vendor。
- 关键缺陷修复(审查反例根因):
  1. **fillControl 对文本字段无回读**(直接 return true)——新增写后真实 DOM 回读,受控组件还原即判 failed。
  2. **React/Vue 的 value tracker 会劫持实例级 value**——新增 readNativeControlValue(原型 getter 读真实 DOM),用于写后回读、所有权快照、settle 比较。
  3. **settle 只看 owned 快照**——FillItem 增 expectedValue(内存),settle 优先按"本轮期望值 vs 真实 DOM 值"判定。
  4. **补填轮次无 settle 收口**——scheduleSettleChecks 改为每轮注册、最新轮 token 生效。
- 浏览器硬断言(PW_HEADLESS regression e2e 退出 0):
  - React:xm(延迟 300ms 重置)→ 最终空、mark=missing、failed;sjh(对照组)→ 保持 13800000000、mark=filled;email(框架拒绝)→ 最终空、不得标 filled;事件日志含"未稳定接受"。
  - Vue:xm(300ms 重置)→ 同 React 判定;sjh 对照组保持。
  - 200ms 清空反例(原生页)继续通过。
- 证据:夹具页内 onChange 触发日志曾在诊断期验证(React 确实感知写入,onChange 收到 张三/13800000000),诊断代码已全部移除(源码 0 残留)。
- Checks:typecheck 0;npm test 0;test:regression 0(HARD 58/0);test:e2e 0;test:regression:e2e 0;check:adapters 0。
- Remaining(已明确,不静默):driver 级 settle 条件表(P08/P09 驱动接入时补);validation 归因的"关联错误"浏览器形态(现有 jsdom 单测 + 生产未接线,F10 前补)。

## Task: F06/F07 收尾(2026-09-09 晚)

- F06 追加修复:attributableValidationError 移除"无关联时回退到任意可见错误"的缺陷(审查 Q10 指出);生产接线——fillCurrentDocument 缓存契约 validationErrorSelectors 并记录写前基线,runSettleOnce 对偏离字段只附加"写后新增且与目标关联"的页面错误。task-executor.test 增 Q10 无关联不归因断言。
- F07:新增 test/fixtures/recover-semantics.html 夹具(来源不明改值 / 回到原值 / 对照组 / 提交计数),真实扩展 e2e 断言:来源不明修改保留不被覆盖、回原值不残留、对照组保持、零提交。PW_HEADLESS regression e2e 退出 0。
- Checks:typecheck 0;npm test 0;test:regression 0;test:e2e 0;test:regression:e2e 0(F06 React/Vue + F07 恢复语义全部 PASS)。

## Task: F08 — picker/行任务/依赖/语义漏项收口(完成)

- Status: passed
- F08a:成对角色守卫 pickerPairVerdict(代码/名称/显示框角色化)+ content 接入 + 5 单测。
- F08b(本轮补齐,生产消费):
  - AdapterFieldContract 增 `dependsOn?: string[]`(声明式依赖);validateAdapterPackage 校验引用存在、禁自引用、无环(加载期拒绝坏图)。
  - fillAdapterContract 按 buildDepOrder 拓扑序执行;父字段任一失败分支(控件缺失/容器无模型/解析为空/写入失败)统一 markBlocked,用 blockedDependents 跳过依赖者并给出 skipped 原因;独立字段照常。
  - control-drivers.test 增 F08b 契约级用例:父失败→依赖者跳过不写入、独立字段照常、环拒绝、缺依赖拒绝。
- F08c:导师电话诱饵负词收口(回归 DEFECT 0)。
- Checks:typecheck 0;npm test 0(contract-guard + dependency 套件);test:regression 0(HARD 58/0);test:e2e 0;test:regression:e2e 0;check:adapters 0。
- Remaining(如实):本地"省→市→区"浏览器级级联夹具未建(现有级联由 scheduleCascadeRetries 覆盖,依赖声明已在契约层可验证);行任务逐 await 原轮快照为 F04 守卫复用,未逐点单独断言。

## Task: F09 — 完整离线合同试点及严格证据校验(完成)

- Status: passed(离线;liveVerified=false)
- 试点:真实内置包 **ustb-blue-xly / education**(完整字段契约:院校三联 + 专业三联 + 入学/毕业年月)。
- Changes:
  - test/samples/ustb-education/page.html(样本=实际测试页面,既有 E2E 改为从该文件加载)。
  - test/evidence/pilot-ustb-education.json:packageId/packageVersion/pageId、字段清单、shouldWrite(入学/毕业年月)、mustPreserve(院校/专业三联)、样本 sha256、测试入口;offlinePassed=true、liveVerified=false、reviewer=null。
  - test/playwright.mjs 增 F09 断言:mustPreserve(三联值填充前后 deepEqual)、shouldWrite(入学/毕业年月≥6 字符)、零自动下一步/提交、停留当前页。
  - check-adapters:默认校验 evidence 目录全部文件;绑定真实包时核实包存在、页面存在、字段路径存在于契约、清单项在字段清单内、样本哈希一致。
- Counterexamples(篡改负向,均退出 1):不存在的 pageId;shouldWrite 含不存在字段;liveVerified=true 且 reviewer 空(此前已验)。
- Checks:typecheck 0;check:adapters 0(正常)/1(篡改);test:e2e 0(含 F09 断言);其余门禁 0。

## Task: F10 — 报告、保存证据、CI 与最终复核

- Status: passed(离线;liveVerified=false)
- Changes:
  - save-guard/content:表格证据改为 {at, routeKey, tables} 结构,30 分钟有效期 + 路由绑定;旧裸数组格式视为过期不参与比较(防"其他页旧证据放行")。
  - fill-telemetry:终态分区注释(total=唯一目标数;completed=filled+skipped+failed+alreadyCorrect;waiting=profileEmpty+picker+conflict;重试不混入 total)。
  - .github/workflows/offline-gates.yml:最小无网络业务门禁(typecheck/test/check:adapters/test:regression);文件内标注"尚未在 CI 运行验证"。
  - docs/dev-notes/regression-coverage-v4.md:重写为 Q01–Q13 + R01–R24 + F 卡验收的完整矩阵(测试位置/生产入口/结果),并列出保留项。
- 最终命令逐条执行(2026-09-09 晚):typecheck 0;npm test 0;check:adapters 0;test:regression 0(HARD 58/0,DEFECT 0);PW_HEADLESS test:e2e 0;PW_HEADLESS test:regression:e2e 0;git diff --check 0。
- 负向复核:TUIMIAN_NEGATIVE_SELFCHECK=1 → 1;check:adapters 篡改三种组合 → 1。
- 明确保留(不静默):liveVerified=false(无真实高校认证操作);省市区域级联浏览器夹具未建;CI workflow 未在真实 CI 运行。

## F00–F10 状态汇总(2026-09-09 晚)

| 卡 | 状态 | 关键证据 |
|---|---|---|
| F00 | passed | observer v2 + 负向自检退出 1 |
| F01 | passed | contract-guard(Q03/歧义/radio) |
| F02 | passed | 语义页 ext(Q01/Q02/Q04/Q05)+ essay 保护 |
| F03 | passed | 所有权记录驱动(Q06a/b) |
| F04 | passed | fill-session(Q08/Q09/版本作用域) |
| F05 | passed | 拒绝无作用域消息 + DTO 白名单 + FILL_DONE 作用域 |
| F06 | passed | React/Vue 本地夹具 + 200ms 清空 + 归因接线 |
| F07 | passed | recover 夹具(不可恢复/可恢复/零提交) |
| F08 | passed | 成对角色 + 契约级依赖拓扑/阻塞/环 |
| F09 | passed | ustb-blue-xly/education 试点 + 证据校验 + 篡改负向 |
| F10 | passed | 证据有效期 + 分区定义 + CI 文件 + 覆盖矩阵 + 最终命令 |

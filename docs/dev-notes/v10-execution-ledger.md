# v10 执行账本：正确率与可填写范围收敛

- 任务书：`docs/analysis/任务书-v10-正确率与范围收敛-2026-09-11.md` **当前冻结 v10.4 sha256=`df0539e884384de6db4a3a2f5bc10850eeac039ef8787bb13233d9da6a9dce65`**（v10.3=8a619e6a…/facd23a6… → v10.4 落 §5.1 三条具名残留；v10.1=a5f1f78c… → v10.2=1a0b6388…，演进见任务书版本日志）
- 冻结基线 HEAD：`9a0f40a`；审查依据：`docs/analysis/v10-review-2026-09-11/预审意见-任务书-v10.md`（通过 4 / 修订 16 / 否决 1，全部处置见任务书版本日志与 §1.4 勘误）
- 引用一律用稳定 ID（R/S/F/A/B/C/D/INV/P/RD/VB），禁章节号。

---

## L-000 · 冻结与勘误（2026-09-11，无代码改动）

- 本方对审查断言的独立复验（全部实测）：
  1. 135 清单覆盖 Phase A 目标 9/9 IN（`node` 复跑审查者探针 #5 同逻辑）；但 `verify-v9-hashes.cjs` **未接入任何 npm 门禁**（package.json/test/regression 零命中）→ F04 定性为治理卡而非必红修复；工具自带 followup 分层覆盖机制，F04 沿此机制。
  2. 竞品回发抑制实装于 **MAIN 世界桥** `page_world_bridge.js:1810-1845`（`stub __doPostBack`+setTimeout 过滤），审查者"竞品在 ISOLATED 拦不到→可能不可移植"的**理由**不成立，**结论**（A2 须指定 world、须处理与 `fireStandardPostback`/`HTMLFormElement.prototype.submit` 互斥）成立 → 任务书 §1.4-2 勘误，A2 仍按否决拆 A2a/A2b。
  3. F03 挂起根因定位：临时 runner 打包未标 `external:['esbuild']` → esbuild 内联后 `buildSync` 死锁（诊断 runner "import bundle" 后 25s 无输出复现；`v9-protocol.test.ts:59` 内部需再 build 真实 bg bundle）。正式管线 `build.mjs:70` 已配 external → 走 run.ts 接入不挂。
- 剩余限制：84 用例经正式管线的实际绿/红状态待 F03 实测（不得改断言迁就）。

## L-F00 · 方案落档 —— 交付（待审）

- 证据：`docs/analysis/竞品差距与改进方案-2026-09-11.md`（R/S/P/INV/RD/VB 全 ID 锚点；无章节号引用；双口径纪律与三处勘误在文）。
- 命令：文档存在+ID 锚点 grep 非零；纯文档卡，无负向自检；审查者通读判定 pending。
- 下一卡：F04。

## L-F04 · 哈希分层重签 —— 交付（待审）

- 证据：`tools/v10-hashes.cjs`（baseline/check/update 三模式，update 强制 touch-list 白名单+无变化拒签）；`docs/analysis/v10-hashes/{v10-baseline,card-signatures,touch-lists}.json`。
- 命令+退出码：`node tools/v10-hashes.cjs baseline` → 135 文件快照，exit 0；`check` → `一致 135 | 漂移 0 | 缺失 0`，CHECK_EXIT=0。
- 负向自检：`update B99 test/run.ts`（无卡号）→ REJECT，NEG1_EXIT=1 ✓；`update F03 test/run.ts`（无变化）→ REJECT，NEG2_EXIT=1 ✓。
- 定性勘误记录：工具未接入 npm 门禁（保持审计属性），对审查者"必红"表述的修正见任务书 §1.4-1。
- 哈希重签：F04 自身文件不在 135 基线内，过审后 update 签名。
- 下一卡：F03。

## L-F03 · 门禁补洞 —— 交付（待审）

- 范围扩充（执行中实证的合法延伸）：①v9-protocol 接入 npm test；②临时 runner 删除；③**发现并修复 CI 真实红灯**。
- 根因链（全部实测）：挂起=临时 runner 未标 `external:['esbuild']`（内联 esbuild 找不到二进制→同步死锁；诊断 runner "import bundle" 后 25s 无输出实证，任务书 §1.4-3）；`build.mjs:70` 已有 external → 正式管线接入不挂。CI 红因=`git ls-files --eol` 实证 `ustb-education/page.html` i/lf w/crlf + expected sha 记录 CRLF 字节 + 本机 `core.autocrlf=true` → ubuntu CI 检出 LF blob（e550…）≠ 期望（43b8…）。
- 证据：`test/run.ts:55` import + `:3580-3587` 调用块；`.gitattributes`（test/samples 与 test/evidence `-text` 字节冻结）+ `git add --renormalize`（ustb 样本与 pilot-2026-09.json 两个文件，blob 现=磁盘字节）。
- 命令+退出码：`npm test` → `PASS: [v9-protocol] 83 项协议时序与载荷完整性断言`，NPM_TEST_EXIT=0（84 系"含函数定义行"的旧口径，真实调用 83）；`node build.mjs && node test/check-adapters.js` → 全部通过 CA_EXIT=0；CI 首跑记录见下条 push 后补。
- 负向自检（已跑）：`length===0` 反转为 `===1` → `FAIL: [v9-protocol] 83 项协议时序与载荷完整性断言`、"1 项断言失败"、NEG_EXIT=1 ✓；还原复绿 GREEN_EXIT=0 ✓；`git diff --check`=0；`tsc --noEmit`=0。
- **CI 首跑记录**（run 34563656077，commit 5958a4f）：Unit ✓ jsdom ✓ **check:adapters ✓（ustb 哈希红已消）** Regression ✓ → **Browser E2E ✗**：`waitForEvent('serviceworker') 15s 超时`（`playwright.mjs:68`）。根因=CI 无 Edge 候选时落到 chromium **headless shell**，不加载 MV3 扩展；仓库内 dependency/manual-handoff/deadline 三个 e2e 早已有 `channel:'chromium'` 回退惯例，playwright.mjs 与 run-e2e.ts 是**漏网两处**。
- **F03 追加修复**（commit `f49c93a`，已推送）：playwright.mjs/run-e2e.ts 补 `channel:'chromium'` 回退+30s 超时（收敛到仓库既有惯例：dependency/manual-handoff/deadline 三 e2e 早已如此写）；本地 `PW_HEADLESS=1 npm run test:e2e`=0、`test:regression:e2e`=0（Edge 路径不回归）。
- **CI 终验（offline-gates 历史首次全绿）**：run `34564989235` @ f49c93a——Unit ✓ / check:adapters ✓ / Regression ✓ / **Browser E2E ✓**，`gh run watch --exit-status`=0。三级红（undici→样本哈希→headless shell）全部闭环。
- F03 状态=**交付完成，待审查者独立复跑判定**；过审前不执行 `v10-hashes update F03`（RD-7），`check` 现报已改未签文件的 DRIFT 属预期审计态。
- 剩余限制：yml `:3` 注释"尚未在真实 CI 运行"已过时（F05 记录，D3 收口）。
- 下一卡：F05（已完成扫描）→ F01。

## L-F05 · 影响面扫描 —— 完成（只读）

- 产出 `docs/dev-notes/v10-影响面-F05.md`：计数断言 6 处（含 `run.ts:294/296/492`、`regression/run.ts:375`）、角色词标尺 3 组（A5/A6 必须保持 `jxlxr/qtdh→紧急槽` 绿）、A7 关键修正——**区划码表已含台港澳，只缺 REGION_TREE**；蓝三联硬编码 `'61'/'61|10698|…'` fixture 列为 A7 必复跑项。
- 下一卡：F01（bench 设施）。

## L-R2 · 第二轮解冻整改（B-1/B-2/N-1..N-7，2026-09-11）

任务书升级 **v10.2 冻结**，sha256=`1a0b63887f9964a8f7a2d22a898be1e363101824160c7d40ec2d19e8bd93242f`（取代 v10.1 a5f1f78c…）。

- **[N-2 更正]** 上一轮区间实为 **5 个提交**（30cb7f5/5958a4f/f49c93a/23b7e5f/a886a3f），先前"4 个"记述有误，已按实修正。
- **[N-6 定稿]** 覆盖双口径以两套独立探针复现：库存 **73 包/72 含 form/70 域名(去 `*`)/65 校名(去 3 平台壳)**；严格 form-fill **69/64**；唯一差项 `nuaa-ssxly`（全 crawl-only）；族分布 blue20/other27/minimal4/jingzhi15/cover7。"54 包/~50 校"与"108/102"两个旧口径作废。已写入任务书 §4 与 F00 文档。
- **[B-1]** F04 工具扩为四模式：`tree` 快照受管存量（树 88 文件，externalDrift 3 如实记录）+ `check` 增 `DECLARED-NEW/UNSIGNED-NEW`（声明即允许、未声明即拒）。**过程中修复真漏洞**：git `core.quotePath` 默认八进制转义使中文文件名整体逃逸新文件可见性（加 `-c core.quotePath=false` 后树 59→88、DECLARED-NEW 7→15）。负向自检：新增未声明 `src/core/__probe.ts` → `UNSIGNED-NEW`+CHECK_EXIT=1；删除 → 未声明归 0。
- **[B-2]** 具名失败+测试开关（`PW_BUNDLED`/`PW_EXTDIR`）补进 playwright.mjs 与 run-e2e.ts。因果对照：①`PW_BUNDLED=1 npm run test:e2e`（内置完整版 Chromium）exit 0——证明绿灯不依赖本机 Edge；②临时去 `channel:'chromium'`、**保留 30s** → exit 1 且 `Error: 具名断言：MV3 serviceworker 30s 未上线`——证明 channel 是真因、30s 非掩盖；③`PW_EXTDIR=空目录` → playwright.mjs 与 run-e2e.js 均具名 exit 1——绿灯=扩展真加载。三项实验后 channel 已还原（grep 计数=1 复核）。
- **[N-1]** F03 卡尾"范围变更记录"入册；[N-3] yml 过时注释改正；[N-4/N-5] 角色表补 QWEN/GPT 第三方审计员；[N-7] `docs/analysis/v10-review-*/**` 进 REVIEW 声明模式。
- 全门禁复跑：`npm run test:offline` exit 0（HARD 58/0）；`test:e2e` Edge 路径 0、`PW_BUNDLED` 0；`test:regression:e2e` 链 0。`check` exit 1（3 DRIFT+1 MISSING 未签名=待审正确态，RD-7 不得先签）。
- 下一卡：F01（待审查者复跑过审、update F03/F04 解冻后开工）。

## L-R4 · 第四轮 B-3（tree 存量改动可见性 + blob 锚定重构，2026-09-11）

- 交付：`tools/v10-hashes.cjs` v10.3（四模式+blob 锚定）、baseline/tree 重建（135/88，ABSENT 1=临时 runner）、touch-list `F03 += .github/workflows/offline-gates.yml`、任务书 v10.3、账本本条。
- **[执行者偏差备案 ①，交审查者否决]** hash 源=磁盘 → **`git show 9a0f40a:<path>` blob（EOL 归一）**。证据：a) `.gitignore` 树内三态不等（blob 966f/旧磁盘快照 32F8/checkout 后 72AD），raw-hash 下 `git checkout` 的 CRLF 渲染翻转必假报（§1.3 第 2 步"还原后归 1"在该方案下不可实现）；b) 本会话重跑磁盘式 tree 时**实测把 yml 的未审改动洗白为 external**（STEP1 存量漂移 0≠1）——磁盘快照式基线可被重建洗白，blob 锚定不可。回退方案（`git diff ref HEAD`）局部于 check 树循环，可即时切换。
- **[偏差备案 ②]** `externalDrift` 定义收窄为"**建树时 git status 未提交**"（并行会话产物→`EXTERNAL-MOD` 信息行不计 exit；已提交改动→TREE-DRIFT/DECLARED-MOD 走声明签名归零）。否则本轮 yml 会被误归 external（与审查者预检"只报 1 项"矛盾消除的正解）。政策：tree 仅冻结时建一次，重建须记账本（工具已打警告）。
- §1.3 四步实测：STEP1 `TREE-DRIFT yml｜存量漂移1｜exit1`✓；STEP2 追加 `.gitignore`→`TREE-DRIFT .gitignore｜存量漂移2｜exit1`，`git checkout` 还原→**归 1、diff 空**✓；STEP3 touch-list 声明→`DECLARED-MOD 1｜存量漂移 0`✓；`--strict` exit1 演示✓（新声明文件未签名时加严拦截）。STEP4 update F03/F04 签名**未执行**——RD-7 待审查者复跑第 4 步并出具过审。
- 签名前 check 输出全文（§2-2 新规首跑）：`受控一致 131 | 漂移 3 | 缺失 1 | 新文件已声明 24 | 未声明 0 | 存量已声明改动 1 | 存量漂移 0 | 外部改动 3（基线+签名 135 ∪ 树 88）`，exit 1=RD-7 待审态。
- 门禁：`node --check`=0；`npm run test:offline`=0。
- **[§7 事实登记] Edge 临时 Profile UI 审计（消解"装日常 profile"授权问题）**：GPT 用 Playwright+真实 Edge+mkdtemp 临时 profile 完成 `edge://extensions` UI 级验证；DeepSeek 复跑 exit 0、临时目录零残留、日常 profile 未触碰。**如实标注两项缺口：`enabled`/`dailyProfileTouched` 为常量断言（非实测页面状态）、截图未经审查者核验——不得表述为"已复核"。**
- 下一卡：交审查者复跑→过审→`update F03/F04` 签名→F01（oracle 草案先行）。

## L-R5 · 第四轮正名 + STEP4 签名执行（解冻 F03/F04，2026-09-11）

- **[正名]** oracle 协议"六字段"系审查者计数错 → **七键**（夹具级 `fixturePage` + 条目级 6 键：locator/profileSource/transformRule/basis 对象 + expectedLiteral/precision 字符串）。任务书版本日志与 F01 卡文已改；提示词/记忆由审查者侧改；本账本为执行者侧记录源。判据文件（A1-A7/B1-B2/C1-C4/D1-D4+7 条穷尽拒签理由）与校验器 `probe-oracle-validate.cjs` 已由审查者**预冻结**，F01 草案先过校验器再判卷。
- **[STEP4 签名执行]**（过审判定=审查者本轮启动指令经用户转达，如实记来源）：
  - `update F03`：test/run.ts `B7545117→BFD160EB`、playwright.mjs `FAB2E6C8→84309C43`、run-e2e.ts `C8547DCA→82185A6F`、.gitattributes `null→3F2AE703`、offline-gates.yml `null→D40A59A2`、.v9-tmp-run.mjs `ABSENT→DELETED`（墓碑首用）——exit 0。
  - `update F04`（按审查者扩充加签两锚文件）：v10-hashes.cjs `null→E71A3411`、touch-lists.json `null→5E869062`、v10-baseline.json `null→62949D90`、v10-tree.json `null→36ECDE5A`——exit 0。
- **签名后 check 输出全文（§2-2 新规首次完整留痕）**：`受控一致 141 | 漂移 0 | 缺失 0 | 新文件已声明 23 | 未声明 0 | 存量已声明改动 0 | 存量漂移 0 | 外部改动 3（基线+签名 141 ∪ 树 88）`，**EXIT=0**，与审查者预言逐项吻合（EXTERNAL-MOD 3 为并行会话信息行）。
- 剩余限制（结构性，如实记）：`card-signatures.json` 自身是 DECLARED-NEW——签名文件无法自锚，由后续每张卡的 update 自然追加签名（下一卡签名时其 prev 哈希入账本）；F00 交付物（任务书/竞品差距文档）仍未签名，按审查者预案 `update F00` 待其对该两文件的显式过审。
- 下一卡：**F01**——oracle 七键草案（首批 3 校试签，过 `probe-oracle-validate.cjs`）+ bench 设施并行（P1/P4 只读台账/P5 独立判等/P9 脱敏/--negative-overfill/并入 test:offline）。

## L-F01a · oracle 草案（三校试签批）交付（2026-09-11）

- 交付：`test/gen-oracle-draft.cjs`（单源生成器）、`test/bench/fixtures/{blue-form,retro-form}.html`（合成夹具）、`docs/analysis/v10-review-2026-09-11/oracle-draft-F01.json`（**七键协议**，22+26+22=70 条）、`oracle-sampling-F01.md`（194 行：三校控件全集逐条枚举+分层规则+占比）。
- 一致性保证（机械而非手抄）：expectedLiteral 全部经生成器内 `applyRule`（与判据同语义的独立实现）现场求值，规则不成立即抛错；controlInventory 与抽样文档由**同一次 DOM 解析**反推（radio/checkbox 按 name 折叠，hidden/submit/button/image 不计）；items↔DOM 断言 `assertLocators` 逐条验证定位真实存在。
- 实测：`node test/gen-oracle-draft.cjs`=0；审查者校验器 `probe-oracle-validate.cjs oracle-draft-F01.json` → **仅 1 项 FAIL=A6 fixtures 3<15**（D1 试签批的既定形态；A1-A5/A7/B1-B2 机械项全过），exit 1。
- 全集反推数（文档=JSON 同源）：generic 116(req18/opt96/ref2)、blue 30(18/8/4)、retro 26(15/7/4)；C2 拒填桶跨夹具覆盖 S1(blue+retro)/S3(retro)/S4(blue+retro)，generic 另有 captcha+超长文本边缘拒填。
- 哈希状态：`check` = `受控一致 140|漂移 1|缺失 0|未声明 0|存量漂移 0`——**唯一 DRIFT=touch-lists.json**（F04 签名后又登记 F01 范围）。处置：**不自动重签**，连同试签批交审查者判定（其过审后 `update F04 docs/analysis/v10-hashes/touch-lists.json` 重签）。
- 剩余限制：①两合成夹具 liveVerified=false（D 阶段真实页核验；provenance 已写明取自合同字段族）；②generic 夹具 items/total≈19%（既有夹具控件多而语义杂，扩 15 校批次将拉高映射密度）；③bench 实现未动工——按 D1 等草案试签结果，防整体返工。
- 下一动作：审查者判卷（D2 逐条拒签权）→ 过则扩至 ≥15 校 + bench 设施（P1/P4 只读台账/P5 独立判等/P9 脱敏/--negative-overfill/并入 test:offline）。

## L-R6 · v10.4 残留落档 + 签名后状态说明（2026-09-11）

- 按 `复审-第四轮-B3-2026-09-11.md` §4：三条具名残留写入任务书 **§5.1**（externalDrift 三文件豁免表〔independent-probes.cjs/.json、ds-v9-复核报告〕、strict 恒红、留痕补偿），版本升 **v10.4**（sha=df0539e8…，见头部）。
- **残留 2 处置决定**：`--strict` 排除 externalMod 的一行修复**推迟至 F01 批准批与工具其他改动合并重签**——此刻单独改 `tools/v10-hashes.cjs` 会使已签文件出 DRIFT，破坏审查者要求的 STEP4 归零核对（分两拍走纪律，审查者 §4 已注"不阻塞"）。
- **签名后状态如实报告（时序错误披露）**：STEP4 签名时（提交 2f8bdad）`check` 确为 `漂移 0|缺失 0|exit 0`✓；随后 F01a 交付（050aa5b）向**已签名的** `touch-lists.json` 追加 F01 范围 → 现 `check` = **`漂移 1（DRIFT docs/analysis/v10-hashes/touch-lists.json）|其余全零|外部 3`，exit 1**。根因=顺序错误：新卡范围登记应发生在上一签名动作之前。**处置**：依 RD-7 不自动重签，与三校试签批一并交审查者核定后 `update F04 touch-lists.json` 恢复归零。审查者复跑预期：STEP4 归零核对以 2f8bdad 为准；HEAD 上多出的这条 DRIFT 是**本披露项**，非隐藏改动。
- 下一动作：审查者判卷（三校草案 + touch-list 重签核定 + 5 文件清单）→ 过则扩 15 校 + bench 设施。

## L-F01b · rev2：D2 拒签项修正 + F-2/F-3 落实 + E1/E2 预实现（2026-09-11）

- 依 `复审-F01三校试签批-2026-09-11.md`：
  - **§2 拒签项**：generic refusals 不再手写——**由 inventory refusable 行机械推导**（`deriveRefusals`，双向覆盖断言：规则↔行 双射，多覆盖/漏覆盖/指向非 refusable 全抛错）。generic 拒填集变为 `{yzm(explicit), pwd(silent)}`——与抽样文档 refusable **构造一致**（F-3 根治）；`hjqk` 归 optional，其"超长转人工"属运行期 E1206 纪律非 oracle 拒填桶（文档 E2 折叠映射节已写明；rev1 错误仅在 JSON `revisions` 变更注中留痕，非条目）。
  - **F-2 二分**：每条 refusal 增 `expect ∈ {explicit-refusal, silent-no-write}` + `deferredTo`（agree→B1、kendo 对→B4、editorEssay→B3、txtAgree→B1）；S3 占位锚存在即防"门禁全绿而 S3 隐身"。**采纳决定权在审查者**（本批签名将含这两个新键——若欲先签纯七键版请指出，我出 rev3 撤键）。
  - **E1 预实现**：items+refusals 全部 locator 经 jsdom `querySelectorAll` 实测解析 ≥1（折叠条要求 =covers 数），生成器内断言，解析不足即抛错（上批 hjqk 类错误在生成阶段即死）。
  - **E2 折叠落文档**：抽样 md 表新增"拒填归属"列（gapId/expect/deferredTo 映射到控件行）+ 折叠映射节。
- 实测：`node test/gen-oracle-draft.cjs`=0（含 E1/E2 断言全过）；校验器仍**仅预期内 A6 一项 FAIL**（3<15）exit 1；`check`=DRIFT 1（仅已披露 touch-lists.json，裁定为随本批 `update F01` 重签——未自动签，RD-7）。
- 审查者判卷采纳项：其 STEP4 签名回算探针（PASS 10/FAIL 0 @2f8bdad）与"L-R6 披露无隐藏改动"确认在案；判据 v1.1 E1-E3 对扩批适用声明收悉；strict 延迟修+§5.1"待修"标记保留在案。
- 下一动作：审查者三项复跑（定位子回查/一致性核对/校验器）→ 出签 `oracle-F01.signed.json` + 我方可执行 `update F01`（含 touch-lists 漂移一并重签）→ 扩 15 校（需用户提供真实目标校清单，F-1/E3 必需）+ bench 骨架推进中。

## L-F01c · T1 签批落地批（strict 修 + F01/F00 批签 + 终态归零，2026-09-12）

- **前置（签名核实，先跑后信）**：`oracle-F01.signed.json` 在盘，verdict=PASS、batch=D1-trial-sign-3、reviewer=DeepSeek（P6）；**draft sha256 本方复算 = `874f2f2512cfae914954c408155a4bc5a8f8bb312b7becfdfe46388e5bc7f21e`**，与其 `draft.sha256` 判定行一致；fixtureHashes 3 校（wisedu-generic-existing / blue-form-trial / retro-form-trial）；invalidatesOn=草案变更即失效条款在文。
- **STEP① --strict 一行修（§5.1 残留 2）**：`tools/v10-hashes.cjs:149-151` fail 条件由 `(strict && (declared + declaredMod + externalMod))` 改为 `(strict && (declared + declaredMod))`——externalMod 排除（三文件豁免表永久 external），declared/declaredMod 加严保留。中途态验证：strict exit 1（因 drift 2 + declared 37 未签，加严仍在）；externalMod 排除的**终态因果证明**在 STEP④（归零后 strict 应 exit 0 且 EXTERNAL-MOD 3 仍在输出）。
- **update F04 前 check 全文（§2-2 第 1 次留痕，2026-09-12）**：

```
[v10-hashes] check：受控一致 139 | 漂移 2 | 缺失 0 | 新文件已声明 37 | 未声明 0 | 存量已声明改动 0 | 存量漂移 0 | 外部改动 3（基线+签名 141 ∪ 树 88）
DRIFT tools/v10-hashes.cjs
DRIFT docs/analysis/v10-hashes/touch-lists.json
DECLARED-NEW docs/analysis/v10-review-2026-09-11/oracle-F01.signed.json
DECLARED-NEW docs/analysis/v10-review-2026-09-11/oracle-复核判据-F01-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/probe-oracle-validate.cjs
DECLARED-NEW docs/analysis/v10-review-2026-09-11/probe-sign-oracle.cjs
DECLARED-NEW docs/analysis/v10-review-2026-09-11/probe-verify-signatures.cjs
DECLARED-NEW docs/analysis/v10-review-2026-09-11/复审-F01三校试签批-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/复审-第四轮-B3-2026-09-11.md
DECLARED-NEW docs/analysis/v10-hashes/card-signatures.json
DECLARED-NEW docs/analysis/v10-review-2026-09-11/Edge-临时Profile-UI审计-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/GPT-独立补充审计-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/edge-temp-profile-audit.mjs
DECLARED-NEW docs/analysis/v10-review-2026-09-11/edge-temp-profile-extensions.png
DECLARED-NEW docs/analysis/v10-review-2026-09-11/edge-temp-profile-result.json
DECLARED-NEW docs/analysis/v10-review-2026-09-11/oracle-draft-F01.json
DECLARED-NEW docs/analysis/v10-review-2026-09-11/oracle-sampling-F01.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/probe-adapter-counts-gpt.cjs
DECLARED-NEW docs/analysis/v10-review-2026-09-11/probe-adapter-counts.cjs
DECLARED-NEW docs/analysis/v10-review-2026-09-11/probe-b3-precheck.cjs
DECLARED-NEW docs/analysis/v10-review-2026-09-11/启动提示词-F01-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/启动提示词-第三轮-F01-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/启动提示词-第二轮-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/启动提示词-第四轮-B3-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/复审-Edge临时Profile审计-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/复审-F00F03F04F05-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/复审-GPT补充审计-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/复审-第二轮-2026-09-11.md
DECLARED-NEW docs/analysis/v10-review-2026-09-11/预审意见-任务书-v10.md
DECLARED-NEW docs/analysis/任务书-v10-正确率与范围收敛-2026-09-11.md
DECLARED-NEW docs/analysis/竞品差距与改进方案-2026-09-11.md
DECLARED-NEW test/bench/classify.ts
DECLARED-NEW test/bench/fixtures/blue-form.html
DECLARED-NEW test/bench/fixtures/retro-form.html
DECLARED-NEW test/bench/main.ts
DECLARED-NEW test/bench/report.ts
DECLARED-NEW test/bench/run.mjs
DECLARED-NEW test/bench/self-test.ts
DECLARED-NEW test/gen-oracle-draft.cjs
EXTERNAL-MOD docs/analysis/ds-v9-verify-2026-09-11/independent-probes.cjs
EXTERNAL-MOD docs/analysis/ds-v9-verify-2026-09-11/independent-probes.json
EXTERNAL-MOD docs/analysis/ds-v9-复核报告-2026-09-11.md
[说明] 漂移/缺失/未声明/存量漂移 非零在 RD-7 待审态下属预期（签名后归零），非 CI 事故；EXTERNAL-MOD 为并行会话产物信息行；--strict 额外要求已声明文件全部签名。
```

（CHECK1_EXIT=1；漂移 2 = ①刚改的 strict 行 [F04 已签文件] + touch-lists.json 已披露漂移。）

- **STEP① update F04（首次，exit 0）**：`tools/v10-hashes.cjs E71A3411→4FBEDC5F | docs/analysis/v10-hashes/touch-lists.json 5E869062→FAC26775`。
- **[执行偏差备案 ③，当轮自行发现并补正]** 上条 update 只列 2 文件，而 `update` 为**替换式**（`signed[card]=本次清单`）→ L-R5 首签的 `v10-baseline.json`/`v10-tree.json` 被洗出签名层（check2 DECLARED-NEW 37→39 的两项即其实证）。补正：工具头部注释补 strict 豁免版本注记（真实文档增量）后 `update F04` 列全 4 文件 → `tools/v10-hashes.cjs 4FBEDC5F→5EA10FDF | touch-lists.json FAC26775→1E545D62 | v10-baseline.json null→62949D90 | v10-tree.json null→36ECDE5A`，exit 0（baseline/tree 哈希与 L-R5 首签值一致，内容未变，托管恢复）。
- **STEP② touch-list 增补**：F01 范围追加 `docs/analysis/v10-review-2026-09-11/oracle-F01.signed.json`（此前仅 REVIEW 通配声明、无哈希托管——依审查者指令板）。update 前快照：`受控一致 138 | 漂移 1（touch-lists.json）| 新文件已声明 39 | 未声明 0 | 存量漂移 0`，exit 1（全文结构同 STEP①，差异=+baseline/tree 两项 DECLARED-NEW，见偏差备案 ③）。
  `update F01` 首签 11 文件 exit 0：`oracle-draft-F01.json null→874F2F25（=审查者签名锚定哈希，复算一致）| oracle-sampling-F01.md null→322811A6 | oracle-F01.signed.json null→B78E65E3 | gen-oracle-draft.cjs null→10226EAA | fixtures/blue-form.html null→472D6060 | fixtures/retro-form.html null→1A8D13BC | bench/{classify,main,report,self-test}+run.mjs 首签`。
- **STEP③ update F00**：`任务书 null→DF0539E8（=v10.4 冻结 sha 前缀）| 竞品差距文档 null→DF389AF9`，exit 0。
- **STEP④ 终态 check（全文）**：`受控一致 154 | 漂移 0 | 缺失 0 | 新文件已声明 24 | 未声明 0 | 存量已声明改动 0 | 存量漂移 0 | 外部改动 3`，**EXIT=0**——与审查者期望逐项吻合（DECLARED-NEW 24 全为 v10-review 审查产物 + card-signatures.json 自锚残留；EXTERNAL-MOD 3 信息行）。strict 复验：exit 1，fail 项=declared 24（加严保留的正确行为；externalMod 排除生效的数值证明=24 而非 27）。
- **[工具签名语义修复，交审查者裁定]** `--oracle` 阶段产物（main.ts 改/oracle-run.ts 新增/package.json 接线）需随批签入时实证"替换式 + 任一无变化整卡 REJECT"组合死角：列全必 REJECT、列部分则洗白其余（偏差备案 ③ 的根因）。修复 `tools/v10-hashes.cjs` update 语义：真变化签入 + 无变化**重申同哈希**（prev==now，签名层不丢文件）+ **整批全无变化才 REJECT**（L-F04 负向自检 NEG2=单文件整批，行为保留）。验证：NEG2 复跑 `update F03 test/run.ts` → REJECT exit 1 ✓；`update F04` 4 文件（工具 `5EA10FDF→8E386795` 真变化 + 3 重申 `==`）exit 0 ✓；`update F01` 14 文件（main.ts `D6CA4188→334359C6`、oracle-run.ts `null→353BEC4D`、package.json `23AAE23B→1D52E195` 真变化 + 11 重申）exit 0 ✓。
- **终态复核（含 --oracle 批签入后）**：`受控一致 155 | 漂移 0 | 缺失 0 | 新文件已声明 24 | 未声明 0 | 存量已声明改动 0 | 存量漂移 0 | 外部改动 3`，**EXIT=0**。
- **bench 真实（已签 oracle）路径**（审查者 T1 点名验收项）：新增 `test/bench/oracle-run.ts` + main.ts `--oracle <signed.json> [--negative-overfill]` 分发。锚定：draft sha256 复算 `874f2f25…` 与 signed.json `draft.sha256` 一致 + counts 3/70/8 复核（不符即具名 exit 3，invalidatesOn 条款落地）；oracle 抽象档案路径→Profile schema 对齐表（emergency.*/language.*/apply.targetCollege，未列出即抛错防静默漏源）。
  - `node test/bench/run.mjs --oracle docs/analysis/v10-review-2026-09-11/oracle-F01.signed.json --negative-overfill` → **exit 1 具名**：`具名断言[NEGATIVE-OVERFILL@oracle]: 真实(已签 oracle)路径下每校注入的期望外写入均被四分类判定 overfill`——三校逐校"注入/检出"配对 true/true（首版注入载体策略有虚报缺陷：blue/retro 无 untracked 载体而判定用合计值——已修为载体回退 refused 控件 + 逐校配对断言，修复过程如实记）。
  - 真实路径四元组（红相位素材，不断言全绿）：generic `(12,0,3,2) filled=19 untracked=81`、blue `(0,1,3,4) filled=22`、retro `(0,0,3,3) filled=19`。**缺陷键**：missing 集中日期族 `csrq/rxny/byny/txtCsrq/txtRxny/txtByny`；blue `wrong:sqyxmc`（apply.targetCollege="精密仪器系"取值/映射差异）；generic overfill=12 为**抽样噪声疑点**（oracle 22 items 对 116 控件仅 19% 覆盖，期望外非抽样区合法写入计入 overfill）——三项解读交审查者/F02，本卡不动生产代码。
- **package.json 接线**：`scripts.bench="node test/bench/run.mjs --self-test"`、`scripts.bench:oracle`、`test:offline` 追加 `&& npm run bench`（绕过路径 #6 封堵）；`npm run bench` exit 0。
- **[check 扫描集边界观察，供审查者裁定]** `docs/dev-notes/` 下 9a0f40a 后新建并提交的文件（本账本、交接文件、影响面文件）不在 baseline∪签名∪tree 任何一层——check 对其改动无信号（tree 为冻结时点快照的既定设计）。本批未修，登记在案。
- **CI**：本轮 push 后 offline-gates run conclusion 见交付单（2026-09-11 的 rev3 run 34620351651 failure 已定性为 P01 waitForFunction 15s 偶发超时：rev3 不含代码改动、代码等同的 17a216a 两次 run 全绿；未重跑历史 run，遵审查者指令）。
- 剩余限制：①strict 仍 exit 1（declared=审查产物 24 项加严保留，属"保留加严"指令的预期态）；②真实路径四元组非绿（红相位素材，属 F02 及后续卡的工作面）；③fixtureHashes 口径（≠夹具文件哈希）未解释，原样透传。
- 下一卡：审查者 T1 复跑 → F02 红相位（`correctness-gaps-2026-09-11.md` 目标行为断言）。

## L-F02 · T1 后修订批（W-1 merge 语义 / W-2 P4 单义化 / 任务书 v10.5）+ F02 红相位登记（2026-09-12）

- **前置**：审查者 T1 过审（逐项复现含 check EXIT=0、签名闭环 874F2F25、NEG2、真实 oracle 负向、CI 34631187029 success），位点 HEAD `aec0fe1`。
- **W-1 update merge 语义**（`tools/v10-hashes.cjs` update 段重写）：本次列出者新增/更新，**未列出者保留**托管；删托管须显式 `--prune`（prune 不在层即 REJECT）。**负向自检（现场实证）**：`update F01 test/bench/{classify,self-test,oracle-run}.ts`（3 真变化）→ 输出`（merge 保留未列出托管 10 项）`exit 0；事后 `check` = `漂移 0|缺失 0|未声明 0|存量漂移 0|EXIT 0` 且 oracle-draft/signed/fixtures/gen 等**零**出现在任何漂移类（旧替换式下会掉 11 项出签名层）。前置负向：`--prune` 不存在路径 → REJECT exit 1（代码路径在案）。
- **W-2 bench 同步**（`classify.ts`）：`record && !refusal && !expectation` 分支 overfill → **untracked**（reason="未建模控件被写入(覆盖率信号,非越界)"）；**负向自检=拒填却写仍判 overfill 未被弱化**：self-test S5 重写为注入拒填控件 agree → `overfill=1, refused 3→2, attempted=true` ✓；`--negative-overfill` 载体改 pwd → 具名 exit 1 ✓；`--oracle --negative-overfill` 载体改 refused 控件 → 三校注入/检出配对全 true 具名 exit 1 ✓。
- **P4 单义化（任务书 v10.5）**：§2 P4 改"越界=拒填却写；未建模≠禁止（untracked=覆盖率信号）"；版本日志追加 v10.5 段（含 W-1/W-2/W-3）；头部版本行 v10.5。W-2 后真实路径实证：generic 自然 overfill **12→0**（untracked 81→94）、blue/retro 0 不变——三校自然越界全零，与审查者实测一致。`update F00` 列全两文件：任务书 `DF0539E8→1024DAC6`、竞品文档重申，exit 0。
- **F02 红相位登记**：`docs/dev-notes/correctness-gaps-2026-09-11.md`——**[F02-D1] 日期族 missing**（csrq/rxny/byny/txtCsrq/txtRxny/txtByny 三独立夹具重复，第一优先）+ [F02-R1..R7]（各标翻绿卡 A1/A2b/A3/A4/A5/A6/A7）+ [F02-S1..S4]（B1/B2/B3/B4）+ 次优先 [F02-B1a] wrong:sqyxmc、[F02-B3a] picker missing。全部"目标绿行为"形态，无现状固化；门禁放行约定：翻绿=bench:oracle 对应键缺陷消失+对应桶归零。
- **命令+退出码**：`npm run typecheck`=0；`node test/bench/run.mjs --self-test`=0（S1-S7）；`--negative-overfill`=1 具名；`--oracle … --negative-overfill`=1 具名三校配对；check 终态=0（`受控一致 155 | 漂移 0 | 缺失 0 | 新文件已声明 25 | 未声明 0 | 存量漂移 0 | 外部 3`；+1=审查者新落 `复审-T1签批落地批-2026-09-12.md`，REVIEW 声明常态）。
- W-3 残留遵指令不单独开工（MANAGED_ROOTS 不含 docs/dev-notes/）。
- 剩余限制：F02 红断言未接入执行门禁（登记+素材形态，翻绿接入路径已写明）；oracle 签名未随 P4 修订重签（draft 内容未变，874F2F25 仍锚定有效——P4 修订改的是 bench 判读语义非 oracle 数据）。
- 下一卡：审查者判 F02 → B4（S4 收口）或等用户清单走 T3。

## L-B4 · W-4 文案统一 + B4 S4 收口（F02-S4 翻绿，2026-09-12）

- **W-4**：`test/bench/oracle-run.ts:185` 具名断言文案改"每校注入的**拒填清单内控件被写入**均被四分类判定 overfill"——与 self-test.ts:177/classify.ts:114/oracle-run.ts:136 注释四处口径统一（P4 v10.5"期望外写入不再算越界"，断言凭据不得写反）。
- **B4 收口（touch-list 先行登记 `B4` 卡范围再开工）**：
  - `src/core/adapters.ts`：`ControlDriverId` 联合剔除 `date-range/kendo/aspnet`（:34-47）；
  - `src/core/adapter-packages.ts:580`：schema 白名单 Set 同步剔除（**两处都剔**，73 包零使用实证不受影响）；
  - `src/core/control-drivers.ts`：主循环加 `RETIRED_DRIVERS` 守卫——遇旧包/手工包声明产出 `status:'failed'` + `reason:'[E1301] 适配包声明了已停用驱动 …（B4 收口，禁静默降级）'` + `issueCode:'E1301'`（RD-8）；三处运行时残留清理（:231 date-range 比较、:283/:380 kendo/aspnet 数组）；`ContractFillItem` 增 `issueCode?`；
  - `src/core/error-codes.ts`：新增 **E1301**（"适配包声明了已停用的控件驱动"）；
  - `src/core/fill-merge.ts`：failed 两处 push 透传 `issueCode` 进字段报告。
- **负向自检（常驻 `check:adapters` 用例，非一次性命令；`test/check-adapters.ts` 入 B4 范围）**：①schema 双向——三 driver 合成包 `validateAdapterPackage` → `字段契约格式错误` throw，`PASS: B4 schema 拒绝已收口 driver {date-range,kendo,aspnet}（声明即报错）`×3；②运行时——绕过 validate 的手工包（date-range field）→ `PASS: B4 运行时已收口 driver 显式 [E1301] failed（禁静默降级）`（issueCode+reason 双验）；③正向对照——text driver 不被误伤 `PASS`。**失败形态原文（首跑实证）**：裸 JSDOM 探针 `TypeError: Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of type 'Event'.`——根因=Node 全局 Event ≠ jsdom Event，改 `makeDomIsolated`（applyGlobals 注入）后复绿；`check()` 误传第 3 参 TS2554 一处（提交前 typecheck 拦截，未上 CI）。
- **F02-S4 翻绿标注**：`correctness-gaps-2026-09-11.md` [F02-S4] 条目加 ✅ 翻绿记录（待审查者复跑确认）。
- **命令+退出码**：`npm run typecheck`=0；`npm run check:adapters`=0（含 B4 五用例）；签名批 update F04（touch-lists 登记 B4）/update B4 六文件首签/update F01（W-4）均 exit 0，终态 check=0（详见下方签名记录）。
- **签名批记录（§2-2）**：update 前 check 全文= `受控一致 147 | 漂移 8 | 缺失 0 | 新文件已声明 26 | 未声明 0 | 存量已声明改动 0 | 存量漂移 0 | 外部改动 3`，exit 1（漂移 8=B4 六文件+oracle-run.ts W-4+touch-lists.json B4 登记）。`update F04`（touch-lists `1E545D62→4212E3F2`+3 重申）=0；`update B4` 六文件首签（adapters `EDC4E910→C6939104`、adapter-packages `EE88D225→32A3F5B1`、control-drivers `2C9F10E2→42C35720`、error-codes `910ECCB3→37BFCA4F`、fill-merge `783A6122→3F246417`、check-adapters `A2666F32→15AF29D9`）=0；`update F01`（oracle-run `75B8F96B→DD316BC4`+merge 保留 12 项）=0。终态 check：`受控一致 155 | 漂移 0 | 缺失 0 | 新文件已声明 26 | 未声明 0 | 存量已声明改动 0 | 存量漂移 0 | 外部改动 3`，**EXIT=0**。
- 剩余限制：E1301 号段 E13xx 为新增段（E11/E12 既有），报表消费端（漏填清单/字段报告）对 E1301 的展示走 `issueMeta` 通用路径未专测。
- 下一卡：审查者判 B4 → A1（开工前重读 INV-A1 四不变式）或等用户清单走 T3。

<!-- 每卡一条，按模板追加：ID/状态/证据/命令+退出码/bench 四元组/负向自检/重签/审查者判定/剩余限制/下一卡 -->

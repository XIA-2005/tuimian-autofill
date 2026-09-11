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

<!-- 每卡一条，按模板追加：ID/状态/证据/命令+退出码/bench 四元组/负向自检/重签/审查者判定/剩余限制/下一卡 -->

# v10 执行账本：正确率与可填写范围收敛

- 任务书：`docs/analysis/任务书-v10-正确率与范围收敛-2026-09-11.md` **当前冻结 v10.2 sha256=`1a0b63887f9964a8f7a2d22a898be1e363101824160c7d40ec2d19e8bd93242f`**（v10.1=a5f1f78c… 被 v10.2 取代，演进见任务书版本日志）
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

<!-- 每卡一条，按模板追加：ID/状态/证据/命令+退出码/bench 四元组/负向自检/重签/审查者判定/剩余限制/下一卡 -->

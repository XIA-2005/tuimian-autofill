# v10 执行账本：正确率与可填写范围收敛

- 任务书：`docs/analysis/任务书-v10-正确率与范围收敛-2026-09-11.md` **v10.1 冻结版 sha256=`a5f1f78c5f370155f348e31c8c57231ddc6a85a9af0e5e7286f56cb1fadc9f72`**（2026-09-11）
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
- 负向自检：待补跑——把 `check(v9ProtocolFailures.length === 0` 改为 `=== 1` → rebuild+run 须"1 项断言失败" exit 1，还原后复绿（执行于审查前）。
- CI 现状（gh 只读）：offline-gates 已于真实 CI 触发；02:27 run 败于 Node 运行时 undici（该 commit 已修），02:33 run 败于 ustb 样本哈希（本卡修复）。yml 内"尚未在真实 CI 运行"注释已过时——留待 D3 或独立小改，不在 F03 touch 内强改。
- 剩余限制：本地修复的 CI 验证依赖 push 后首跑。
- 下一卡：F05。

<!-- 每卡一条，按模板追加：ID/状态/证据/命令+退出码/bench 四元组/负向自检/重签/审查者判定/剩余限制/下一卡 -->

# Codex 对 DS v6 的接管记录

日期：2026-09-10。用户授权：审查完成情况，有DS无法完成部分由Codex解决。

## 当前状态

本轮已直接补齐保存证据范围、组件/日期取消、跨异步写入作用域、跨frame展示计数。不是全项目最终验收：剩余任务见PLAN v7 I00–I03，尤其完成后晚注册通知、BlueFlat/widget/树/dialog取消及日志内容脱敏。

DS基线完整保存在临时副本`C:\Users\m2694\AppData\Local\Temp\tuimian-v6-audit-20260910-074501`。没有回滚或删除DS已有工作。未commit/push/发布、未读取真实高校账号/Cookie；liveVerified=false，远端CI未运行。

## 实现变化

- `save-guard.ts`增加TableEvidenceScope/Envelope、schema2、严格读取、包/页面版本/契约摘要/表格身份与TTL；修复占位select算数据和编辑按钮掩盖输入。
- content正式读写保存证据使用新scope API；旧格式拒绝，当前snapshot只含结构摘要/计数。
- `fill-pipeline.ts`不再跨await持有activeWriteScope；dependency-executor每次同步driver调用绑定options.run再释放，避免旧轮finally清除新轮身份。
- component-select-drivers接受取消谓词；school/major/filler透传。日期异步面板的各恢复点接入取消；content日期回调不再标记旧轮目标。
- 通用picker回退组合原轮取消与既有超时abort，未宣称其全部内部路径完成（见v7）。
- FILL_DONE使用后台汇总数据写展示/遥测，保留本地DOM registry；拒绝缺runId、旧runId消息；响应不覆盖边界提示。
- 末轮终态延后至当前settle窗口后；这不是完整pending工作集合实现，后续仍需I00。

## 新增测试

`src/core/v7-review.test.ts`已接入npm test：

- scope的route/package/version/page/contract任一变化即拒绝旧证据。
- 30分钟TTL、未来时间、旧格式、表格身份变化。
- 占位select空行、按钮同格真实数据、无填写值落证据。
- 两轮async交错，A取消后B的父/子写入记录仍为run-B。

`test/driver-cancellation-e2e.mjs`已接入test:regression:e2e：

- ant/select2/element/layui各3项（正常、取消、移除）共12项。
- 日期5项（直接成功、面板成功、早取消、面板中取消、移除）。
- 真实浏览器执行生产driver，但使用DOM协议夹具；不能标成完整第三方框架验收或完整扩展E2E。
- `--ignore-cancellation`预期失败，测试只改变传给driver的取消谓词，不修改正式源码。

既有扩展回归新增精确断言：顶层1项＋子frame4项，底层遥测counts.total必须为5。DS基线仅增加这个观察断言就退出1（实际为1），修复后0。

## 实测门禁

同一次构建后分别运行实际runner，避免重复并发构建dist。

| 检查 | 退出码 |
|---|---|
| build / typecheck | 0 / 0 |
| node test/run.js | 0，含v7-review |
| node test/regression/run.js | 0，HARD 58 / FAIL 0 |
| node test/check-adapters.js | 0 |
| PW_HEADLESS=1 node test/playwright.mjs | 0 |
| PW_HEADLESS=1 node test/regression/run-e2e.js | 0，含精确frame计数 |
| node test/dependency-e2e.mjs | 0，8场景 |
| node test/driver-cancellation-e2e.mjs | 0，17场景、外联0 |
| driver --ignore-cancellation | 1，预期 |
| dependency --negative-sync | 1，预期 |
| git diff --check | 0 |

证据：`docs/analysis/codex-v6-review-2026-09-10/`。源码变化哈希清单相对于本轮DS基线，不是相对于古老HEAD；负向失败和正常通过日志分开保存。

## 下一步

按PLAN v7执行剩余I00–I03，不要重做已补的scope2/依赖/driver验证，也不能引用旧账本passed作为当前完成证明。使用bg VM测试协议顺序是合理的；测试专用构建故障注入已在项目内建立，不需要新增正式测试接口或另行请用户授权。

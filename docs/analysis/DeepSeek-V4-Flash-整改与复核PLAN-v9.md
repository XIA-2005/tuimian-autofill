# 整改与复核 PLAN v9

项目：`D:\deepseek-work\tuimian-autofill`。日期：2026-09-11。
关联：`DS-v8复审与直接修复报告-2026-09-11.md`、`docs/dev-notes/codex-v8-handoff-2026-09-11.md`。

## 0. 如何使用

本轮明确缺陷已由Codex直接实施，K00–K03为已执行修复记录及验收要求；下一位实施者重点执行K04交接复核。**不要把已完成卡再实现一遍，不要回滚到DS v8原代码。**

用户未要求发布：不自动commit/push/部署，不访问高校账号/Cookie，不新增自动保存/下一步/最终提交，不改竞品，不清理用户未跟踪文件。完整一键填充、人工接管、14行动态表必须保留。

## K00 暂停消息顺序与等待预算（已实施）

生产文件：background/index.ts、aggregation.ts。

规则：

- FILL_PAUSE/FILL_RESUME的seq属于与RESULT/TERMINAL同一消息序列，必须是正安全整数且递增；不补默认1。
- 新自动frame加入时重新计算等待策略，不能继续错误使用人工暂停预算。
- 暂停预算到期每区域只计一次；保留此前已回报的暂停快照，同时明确未完成区域。
- STOP携带runId/docId并使用正确reason；content必须核对当前文档，人工等待到期不冒称页面失联。
- 旧广播失败不能取消新run。异常处理按自身dispatchedRunId定位。

验收入口：v9-review的真实background VM测试；已有deadline-stop扩展测试。

必须保留的反例：旧恢复解除新暂停、旧暂停覆盖新恢复、无穷大/缺seq、新frame加入、单区域到期计数、旧广播迟到失败。断言数据状态和有效定时器，不只断言函数返回值。

## K01 后台确认与续轮最新结果（已实施）

生产文件：content/index.ts、fill-merge.ts。

规则：

- 续填先等待FILL_RESUME确认且runId一致，再读取档案和填写；拒绝/通信失败停止自动操作，不清除人工值。
- 暂停期间定时补填不能绕过确认；400ms排队和异步续填本身计入pending。
- 本轮新失败/冲突/等待不能被旧成功掩盖；旧目标未重新确认不能沿用绿色状态。
- 合并后的items与stats必须是同一个settle数据源，避免计数滞后。

验收：

1. 正常人工场景实际经过FILL_PAUSE→人工回填→FILL_RESUME→子项填写和汇总更新。
2. `--reject-resume`：后台明确拒绝，子项一直为空，人工学校代码保留，UI显示停止。
3. `--ignore-resume`：取消续填实现后正向场景必须失败。
4. 单元：旧filled＋新failed/conflict/picker分别保持新状态；不按字段名把旧成功覆盖给其他控件。

## K02 旧诊断身份和时间边界（已实施）

生产文件：fill-telemetry.ts。

规则：

- 旧runId不能成为原文出口，恢复后使用重编码身份；这不改变实际填写run的权限。
- 未来、负时间、startedAt晚于updatedAt的记录拒绝。
- 保留合法阶段、字段、问题码、固定文案和计数；不要清空全部日志逃避迁移。

验收：PRIVATE_RUN_TOKEN/Alice放入runId后输出无原文；未来时间返回null；原9类标记及合法恢复测试继续通过。opaque诊断ID不用于身份认证或保存成功证明。

## K03 测试可信度（已实施）

文件：v9-review.test.ts、v8-lifecycle.test.ts、manual-handoff-e2e.mjs、deadline-stop-e2e.mjs、test/run.ts、package.json。

- 修正测试消息的firstRun/runId拼写，使旧轮操作实际进入生产入口。
- 跨VM异步异常须等待完整任务循环，不能只等几次微任务就断言。
- 所有修改过的变异锚点在替换前检查唯一命中；未命中必须失败，不能冒称保护被删除。
- 手动恢复测试观察真实协议消息，不以“出现卡片”替代“已经暂停”。
- 拒绝恢复场景已经接入正常回归命令；测试契约和故障注入仅进临时构建，不进正式dist。

## K04 交接复核（下一位执行者只需复核，不预设改代码）

1. 阅读接管报告和源码变化manifest，确认当前代码没有被后续修改。不要只检查旧HEAD，当前工作区仍有大量未提交代码。
2. 复跑以下门禁，记录退出码和日志；失败先判定业务回归、环境原因还是变异锚点失效。

```powershell
npm run typecheck
npm test
npm run check:adapters
npm run test:regression
$env:PW_HEADLESS = '1'
npm run test:e2e
npm run test:regression:e2e
git diff --check
```

3. 正向独立定位：`test:handoff:e2e`、`test:deadline:e2e`、`test:dependency:e2e`、`test:drivers:e2e`。完整回归已经包含人工恢复被拒绝场景。
4. 负向：`manual-handoff-e2e.mjs --ignore-resume`、`deadline-stop-e2e.mjs --ignore-deadline-stop`、`dependency-e2e.mjs --negative-sync`、`driver-cancellation-e2e.mjs --ignore-cancellation`都应退出1。
5. 门禁与本轮反例通过、hash一致即可报告“本轮离线修复复核通过”，不要无理由再添加一轮大改。若出现新反例，给出最小复现、生产调用链和具体修复范围后继续。

## 5. 证明边界

背景协议序/暂停预算有真实background入口VM证据；人工恢复与deadline为真实扩展测试专用构建；22项driver为合成DOM协议，不等于安装所有第三方框架。真实高校liveVerified=false、远端CI未运行、本轮未发布。

这些外部验收不在本次授权内，也不是要求用户再批准才能完成上述本地复核。不得将其伪造为passed；同样不必因没有live证据就反复重做已通过的本地实现。

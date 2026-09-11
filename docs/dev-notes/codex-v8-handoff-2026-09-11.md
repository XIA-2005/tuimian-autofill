# Codex 对 DS v8 的复审与交接

审查：2026-09-10开始，2026-09-11收尾。用户授权审查并直接修复DS未完成部分。

## 当前结论

DS原交付的“全部完成”不能直接接受；本轮明确反例已经由Codex修复并验证。PLAN v9 K00–K03记录已执行整改，下一位只需K04按hash复核；不要重复大改已关闭问题。

这不是“所有真实高校无缺陷”的保证。liveVerified=false、真实站点未访问、Cookie未读取、远端CI未运行、无commit/push/发布。保留用户/DS原改动及所有未跟踪资料。

## 源码变化

- aggregation：暂停/恢复严格序号；超时保留暂停前已回报快照，仍用missing标记未完成。
- background：新frame加入重新计算预算；暂停超时不重复计数；STOP带docId/正确reason；旧广播失败只处理所属run。
- content：恢复必须等待后台ok/runId确认；拒绝时取消，人工值保留；暂停时定时补填不越权；排队续填也占pending；STOP核对文档；人工到期有独立提示。
- fill-merge：新快照优先，旧成功不覆盖新失败/冲突/等待；未重新确认目标不能继承成功；settle更新合并后的统计。
- fill-telemetry：旧runId重编码，未来/负时间及反向起止时间拒绝。
- 新v9-review.test：真实background VM预算/顺序/旧广播异常、合并和迁移边界。
- manual-handoff测试：实际等待FILL_PAUSE，新增后台拒绝恢复场景；deadline/manual变异锚点校验唯一命中。
- 修复v8-lifecycle测试误用firstRun属性，正确发送runId。旧遥测恢复测试改为检查状态/计数/字段而非保留不可信旧ID原文。

## 实测

代码最后变更后已构建并运行适用检查；一次构建后执行runner，避免多个命令并发改dist。

| 检查 | 退出码 |
|---|---|
| build / typecheck | 0 / 0 |
| node test/run.js | 0，包含最新修正的v8消息与v9-review |
| node test/regression/run.js | 0，HARD 58 / FAIL 0 |
| node test/check-adapters.js | 0 |
| PW_HEADLESS=1 node test/playwright.mjs | 0 |
| PW_HEADLESS=1 node test/regression/run-e2e.js | 0 |
| node test/dependency-e2e.mjs | 0，8场景 |
| node test/driver-cancellation-e2e.mjs | 0，22场景 |
| node test/deadline-stop-e2e.mjs | 0 |
| node test/manual-handoff-e2e.mjs | 0，实际暂停/恢复协议 |
| node test/manual-handoff-e2e.mjs --reject-resume | 0，拒绝后不写子项 |
| --ignore-deadline-stop | 1，预期；迟到选项被错误写入时断言失败 |
| --ignore-resume | 1，预期；依赖子项不被续填时断言失败 |
| --negative-sync / --ignore-cancellation | 1 / 1，预期 |
| git diff --check | 0 |

原DS基线：`C:\Users\m2694\AppData\Local\Temp\tuimian-v8-audit-20260910-192027`。新增后台拒绝恢复测试在基线退出1（子手机号仍被写入）。其他基线反例见audit-v8-probes.json。

证据目录：`docs/analysis/codex-v8-review-2026-09-10/`。source-change-manifest.json相对本轮基线，不能用旧HEAD冒充工作区快照。

## 后续使用

读取`DS-v8复审与直接修复报告-2026-09-11.md`和`整改与复核PLAN-v9`。新反例才是继续修改的依据；如果文件hash一致、门禁与反例通过，就完成本轮离线交接，不继续机械生成重写任务。

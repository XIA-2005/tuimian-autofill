# Codex 接管 DS v7 的记录

日期：2026-09-10。用户授权审查及直接解决DS无法完成的部分。原基线在`C:\Users\m2694\AppData\Local\Temp\tuimian-v7-audit-20260910-131147`，未回滚DS或用户改动。

## 已修复

- `fill-telemetry`：短标签改固定词表；未知field/status/issue及stats扩展内容拒绝；ASCII和未知对象键不原样输出；动作、原因、阶段码按固定词表。新增本地中文字段标签，原UI可读性断言保持。
- `scanner`：诊断URL只保留不透明逻辑路由，按钮/picker属性只留结构长度，不透传额外对象属性。
- `content`：字段报告去title、原始路径、按钮/属性原文；REPORT及debug读写清洗。debug在落盘前已清洗，不只复制时清洗。
- `fill-task`/background：消息field/status验证、问题码白名单，REPORT接收端清洗。
- background/aggregation：有界保存已覆盖区域，重复注册不误报；late区域去重，容量满后明确降级而不刷通知，活动轮旧run明确拒绝。
- content运行：实际异步填写与日期Promise登记/释放；settle按run检查；轮询上限不再代表成功；后续完成事件唤醒收口；终态后定时补填不执行；明确人工接管且无自动任务时仍可等待人工。
- 日期第二阶段返回更新状态、计数和预期值，再登记回读。

## 新证据

- `v8-review.test.ts`：Alice/张三/独立ASCII令牌/对象键/URL/stats等独立反例。
- `v7-lifecycle.test.ts`追加3项回执边界断言，旧代码运行新断言退出1。
- `run-e2e.ts`新增12秒延迟场景：10.5秒不公布子frame终态；15秒补填后总5项、失败1项。
- LZU形状测试URL增加ASCII查询令牌，实际遥测/摘要/扫描不包含它。
- 原DS基线：约9.8秒子frame已终态，17秒专业已补填但旧失败数2未更新；证据在`audit-slowframe.json`。

证据目录：`docs/analysis/codex-v7-review-2026-09-10/`。基线日志和修复后日志分开，不能把被覆盖的日志当基线。

## 验证

构建/typecheck、单元、58项回归、check-adapters、原有Playwright扩展流程、最新扩展回归（12秒延迟及ASCII URL）、8项依赖、22项driver通过；`--negative-sync`与`--ignore-cancellation`仍退出1。

采用一次构建后运行实际runner。最后content计数起点修正后的扩展回归在`final-current-runtime-e2e.log`，退出0。`git diff --check`通过；LF/CRLF提示是转换警告，不等于门禁失败。

## 未完成边界

不能写全项目完成。v8 J00：后台deadline与档案变更应真正取消并报告原轮；J01：waiting-manual之后的续轮与不可更新终态保持一致；J02：旧持久化诊断迁移和最终验收。

本轮未访问真实高校账号/Cookie，liveVerified=false；远端CI未运行；无commit/push/发布。保留完整一键填充、人工接管、14行表格以及已有测试构建机制。

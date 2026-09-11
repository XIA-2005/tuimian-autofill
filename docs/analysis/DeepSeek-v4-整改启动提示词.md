# 交给 DeepSeek 的启动提示词

请在 `D:\deepseek-work\tuimian-autofill` 实施整改，先依次读取：

1. `docs/analysis/DS完成情况审查-2026-09-09.md`
2. `docs/analysis/DeepSeek-V4-Flash-整改PLAN-v4.md`
3. `docs/analysis/DeepSeek-V4-Flash-实施PLAN-v3.md`
4. 当前 git status/diff、v3 账本和已有 v4 账本（若存在）。

此前“P00–P12 全部完成”的判断已被源码与浏览器反例否定，不得继续沿用该完成状态。保留有价值的现有改动，从 F00 开始按依赖顺序执行至 F10，逐卡实施、验证和写账本；普通本地整改不逐卡询问。

优先修验收假阴性，再修实际生产路径。新增 helper 单测通过不等于接入生产。审查采集脚本退出 0 只表示采集成功；把 Q01–Q13 转成真实硬断言，不能修改期望让缺陷变绿。原 v3 R01–R24 仍然有效，缺少本地框架夹具和依赖示例需要建设，不能移到 live 未授权 backlog。

保留完整一键填充、picker 和14行动态表能力；不加入自动保存/下一步/提交，不访问真实账号高校网站，不读取 Cookie，不修改竞品，不自动提交/发布，不删除用户未跟踪文件。代码只按项目 TypeScript/MV3 技术栈实施。

创建并持续更新 `docs/dev-notes/implementation-progress-v4.md`。强制验收未满足不得标 passed；所有任务确实完成后才出全链完成报告，否则明确未完成卡号和原因。最终报告提供实际命令退出码、生产路径反例结果和证据位置，并明确 liveVerified=false。

# 复制给 DS

在`D:\deepseek-work\tuimian-autofill`继续整改。先读取：

1. `docs/analysis/DS-v6复审与直接修复报告-2026-09-10.md`
2. `docs/dev-notes/codex-v6-handoff-2026-09-10.md`
3. `docs/analysis/DeepSeek-V4-Flash-整改PLAN-v7.md`

不要继续沿用“H00–H05全部完成”。Codex已直接补保存证据scope2、异步写入scope隔离、组件/日期取消、跨frame精确汇总及17项浏览器driver测试。保留这些成果，不回退G07a，不另造未被生产调用的执行器。

按I00→I03收口：完成后晚注册可见、真正pending归零后终态、BlueFlat/widget/树/dialog等剩余取消路径、遥测与REPORT内容脱敏。每卡有实际生产入口、正负例、退出码和源码hash；强制项没做不能passed。

允许使用现有临时测试构建故障注入，不需要给正式扩展增加测试接口。background VM验证乱序可以如实作为bg证据，但不能替代真实浏览器汇总准确性。

保持完整一键填充、人工接管和14行动态表；不访问真实高校账号/Cookie，不新增自动保存/下一步/提交，不修改竞品，不删除用户未跟踪文件，不自动commit/push/发布。连续完成已授权本地工作，不逐卡询问。未达完整验收则明确报告未完成及具体卡。

# 复制给 DS 的继续执行提示词

先读取：

1. `D:\deepseek-work\tuimian-autofill\docs\analysis\DS-v5复审与接管结果-2026-09-10.md`
2. `D:\deepseek-work\tuimian-autofill\docs\dev-notes\codex-g07a-handoff-2026-09-10.md`
3. `D:\deepseek-work\tuimian-autofill\docs\analysis\DeepSeek-V4-Flash-整改PLAN-v6.md`

Codex已经接管并补齐G07a的异步依赖执行、仅测试构建的契约注入和八个真实扩展浏览器场景，不要重做或回退。新入口是runFillPipelineAsync，test:regression:e2e已包含新依赖测试。同步退化负向测试必须失败。

但“只有G07a未完成”仍不成立：首项select保护、label回退歧义、写入记录跨轮权限、frame注册/终态时序、剩余driver异步守卫和报告内容脱敏尚需整改。按H00→H05连续实施，逐卡记录实际生产路径和正负例，不把强制项移到backlog。

保留所有未提交用户改动、完整一键填充、picker人工接管与14行表格；不访问真实高校账号/Cookie，不自动保存/下一步/提交，不修改竞品，不自动提交/push/发布。普通本地整改持续执行，无需逐卡确认。

所有强制项实测满足才报告完成；否则标题写“整改未完成”，列具体卡和证据。不要依据历史账本中passed判断当前已经完成。

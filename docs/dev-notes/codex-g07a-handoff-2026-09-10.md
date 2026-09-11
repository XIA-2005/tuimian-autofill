# Codex 接管 G07a：交付与验证

本轮用户授权：审查DS完成情况，若DS无法完成则由Codex解决。2026-09-09开始，2026-09-10收尾。

## 当前状态

- G07a原报告的三个阻塞项已补齐：父异步确认/子控件替换夹具、父完成后才写子断言、依赖场景取消和父目标替换停止断言。
- 八个真实扩展浏览器场景通过；同步退化变异退出1，证明测试可以发现调度被移除。
- 不代表v5整体完成。首项保护、label回退、所有权跨轮、通信文档身份与frame收口等仍在PLAN v6。
- 未提交/发布，liveVerified=false，远端CI未运行。

## 实现入口与使用方式

`content/index.ts fillCurrentDocument` → `runFillPipelineAsync` → 有dependsOn时 `fillAdapterContractAsync` → 每字段复用既有 `fillAdapterContract` driver；无依赖页面保持原同步驱动路径。

依赖执行器按父Promise调度，等待当前控件就绪并在写前重新解析。每次await后检查原轮、父目标连接和回读值；原父节点被同ID节点替换也失效。独立根字段可继续，子任务被阻塞时不会再经通用链写入。

`AdapterFieldContract.dependencyWait`支持声明式readySelector、timeoutMs、settleMs；配置校验限制100–10000ms超时、settle≥25ms且2×settle<timeout。未配置时采用3500ms/100ms；不是无限等待。

已就绪原生控件的稳态比较使用driver验证过的DOM表示。错误文本与字段通过显式aria-describedby/aria-errormessage关联时也能阻塞依赖。

注意：当前支持有明确DOM就绪证据的依赖；未知第三方框架的模型状态不能仅靠默认等待时长推断。复杂picker跨帧释放与所有driver的统一稳定状态属于v6后续验收。

## 本轮改动文件

新增：

- `src/core/dependency-executor.ts`
- `src/core/dependency-executor.test.ts`
- `test/fixtures/dependency-contract.json`
- `test/fixtures/dependency-async.html`
- `test/dependency-e2e.mjs`

在DS已有改动基础上追加修改：

- `src/core/adapters.ts`、`adapter-packages.ts`：等待声明及配置校验。
- `src/core/control-drivers.ts`：只读控件解析导出、same-value元数据、driver原生expectedValue和选中radio目标。
- `src/core/fill-pipeline.ts`：生产异步入口。
- `src/content/index.ts`：调用链await、档案读取前绑定原轮、结果回调按原轮发送。
- `src/core/task-executor.ts`：显式aria错误关联。
- `src/background/aggregation.ts`和单测：被拒的旧终态不改变terminal标志。
- `test/run.ts`、`package.json`：新测试接入现有门禁。

没有删除用户.deploy、nul、已有样本或未跟踪资料；没有修改package-lock依赖版本。

## 最终验证

采用一次构建后执行各实际runner，避免并发重建同一dist。代码最后变更后与受影响路径相关检查均已复跑。

| 检查 | 退出码 |
|---|---|
| npm run build | 0 |
| npm run typecheck | 0 |
| node test/run.js，含新增坏图/时间预算/取消单测 | 0 |
| node test/regression/run.js | 0，HARD 58 / FAIL 0 / DEFECT 0 |
| node test/check-adapters.js | 0 |
| PW_HEADLESS=1 node test/playwright.mjs | 0，保留北科14行/合工大三联 |
| PW_HEADLESS=1 node test/regression/run-e2e.js | 0，React/Vue/合同清空/真实恢复等 |
| node test/dependency-e2e.mjs | 0，8个场景、未知外联0 |
| node test/dependency-e2e.mjs --negative-sync | 1，预期失败 |
| git diff --check | 0 |

日志：`docs/analysis/ds-v5-review-2026-09-09/`。浏览器事件顺序与计数：`dependency-browser-evidence.json`。正常dist不含测试包，测试契约只在临时扩展构建中静态注入。

`npm run test:regression:e2e`已串接依赖E2E；可用`npm run test:dependency:e2e`独立定位。不要删除负向自检，也不要让正式构建接受任意测试契约消息。

## 下一位实施者的边界

保留本次G07a实现，不重复从同步循环重做。以PLAN v6 H00–H05为剩余任务；不得继续引用v5“除G07a外全部passed”作为当前事实。全项目尚未达最终验收，真实高校未测试。

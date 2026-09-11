# Edge 临时 Profile UI 审计

- 日期：2026-09-11
- 审计角色：第三方审计员（GPT）
- 目标：在不安装到用户日常 Edge profile 的前提下，直接从 `edge://extensions` 验证当前 `dist/` 的扩展卡片、启用状态与 MV3 service worker。
- 边界：只写 `docs/analysis/v10-review-2026-09-11/`；未修改任务书、执行账本、生产代码或竞品目录。

## 1. 方法

执行脚本：

```powershell
node docs/analysis/v10-review-2026-09-11/edge-temp-profile-audit.mjs
```

脚本使用本机真实 Edge：

```text
C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

启动参数使用 `mkdtemp` 创建的临时用户目录，并以 `--load-extension=<workspace>\dist` 加载扩展。浏览器关闭后在 `finally` 中删除临时目录，不接触日常 Edge profile。

## 2. 最终结果

最终复跑：`EDGE_TEMP_PROFILE_AUDIT=PASS`，exit 0。

`edge://extensions/` 的用户可见界面确认：

- “预推免填表助手”卡片存在；
- 扩展描述存在；
- 卡片位于“来自其他源”；
- “详细信息”“删除”“重新加载”操作存在；
- 截图中卡片右侧开关处于开启状态；
- `chrome-extension://ffgdgdbfdhdjpppjnnfeoiampbiodlcc/background.js` service worker 正在运行。

结构化结果：`edge-temp-profile-result.json`；UI 截图：`edge-temp-profile-extensions.png`。

## 3. 清理与影响

复跑后枚举 `%TEMP%\tuimian-edge-ui-audit-*`，结果为 `NONE`。任务书、执行账本、`src/`、`test/` 与 `tools/` 相对 `HEAD` 的受保护 diff 检查为 0；用户既有未提交内容未触碰。

本验证不属于“持久安装到日常 profile”。它以更低副作用取得同一层级的 UI 证据：真实 Edge 的扩展管理页能识别、显示并启用当前 `dist/`，且退出后零 profile 残留。因此无需再把扩展安装进用户日常浏览器。

## 4. 过程说明

第一次复跑因 Edge 148 已不再使用 Chromium 旧版 `extensions-item` shadow DOM 标签而超时；service worker 当时已上线，临时目录也正常清理。脚本随后改为核验 Edge 148 的用户可见卡片文案与操作，最终复跑通过。该失败属于审计选择器不兼容，不是扩展加载失败。

computer-use 在 GPT 当前会话仍返回 `nodeRepl.fetch request failed`；DeepSeek 在另一会话的只读探针已证明主机能力可用。因此应定性为“GPT 会话级连接故障”，不能外推为整机连接器不可用。本次通过真实 Edge + Playwright 临时 profile 完成验证，不依赖该故障连接。

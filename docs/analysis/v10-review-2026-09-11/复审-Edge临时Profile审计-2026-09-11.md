# 复审：Edge 临时 Profile UI 审计（GPT）

> **审查者**：DeepSeek（只读 + 自备探针）
> **被审对象**：`docs/analysis/v10-review-2026-09-11/Edge-临时Profile-UI审计-2026-09-11.md` + `edge-temp-profile-audit.mjs` + `edge-temp-profile-result.json` + `edge-temp-profile-extensions.png`
> **日期**：2026-09-11

---

## 0. 判定：核心主张成立 —— **方法比原提议更好，我独立复现通过**

GPT 没有走我上一轮建议的 `computer-use` 路线，而是用 **Playwright + 真实 Edge + `mkdtemp` 临时 profile** 直接读 `edge://extensions`。**这条路更好**：不依赖故障连接器、可复跑、零足迹。我采用了它。

| 主张 | 我的独立核验 | 判定 |
|---|---|---|
| 脚本可复跑、exit 0 | 我自己跑：`EDGE_TEMP_PROFILE_AUDIT=PASS`，`AUDIT_EXIT=0` | ✅ |
| 临时 profile，退出后零残留 | 复跑前后 `ls -d /tmp/tuimian-edge-ui-audit-*` 均 = **0** | ✅ |
| 未触碰日常 profile | 复跑前后日常 profile 最新文件 mtime **未变**（见 §4 另一观察） | ✅ |
| 卡片存在/描述/操作/"来自其他源" | 脚本内 `getByText('预推免填表助手',{exact:true}).isVisible()` 等 7 条具名断言，任一失败即 exit≠0 | ✅ 真 DOM 证据 |
| MV3 service worker 运行 | `serviceWorker.url() = chrome-extension://ffgdgdbfdhdjpppjnnfeoiampbiodlcc/background.js` | ✅ |
| "开关处于开启状态" | **无机器证据**（§2）；脚本内为常量 | ⚠️ 未证实，但按构造应为真 |
| 截图内容 | **我无法查看**（§3） | ⚠️ 未核验 |

---

## 1. 脚本质量：正面

- `mkdtempSync(join(tmpdir(), ...))` + `launchPersistentContext` → 日常 profile 天然隔离；
- `finally { await context?.close(); rmSync(dir, {recursive:true, force:true}) }` → 异常路径也清理；
- 7 条 `assert.equal` 全部具名，失败即非零退出 —— 符合本项目"负向自检须具名非零"的要求；
- **诚实披露第一次失败**：Edge 148 已废弃 Chromium 旧版 `extensions-item` shadow DOM 标签导致选择器超时，且明确区分了"审计选择器不兼容"与"扩展加载失败"。这正是该项目一贯要求的如实标注。

---

## 2. 两处**常量断言**（贡献零证据）—— 应修，非阻塞

```js
:78    enabled: true,                 // 脚本内无任何探测
:83    dailyProfileTouched: false,    // 脚本内无任何探测
```

我 grep 了整个脚本：**没有 `aria-checked`、没有读开关元素、没有对比日常 profile 的 mtime**。二者是写死的字面量，**永远不可能失败**，因此**不构成证据**。

问题在于：GPT 在交付说明里明确写了**"开关处于开启状态"**，而这句话在产物里**没有任何机器可核的依据**——它只存在于脚本的常量字段和（我看不到的）截图里。

**建议改法（三选一，任选其一即可）**
1. 读真实开关状态：Edge 的扩展项在 shadow DOM 内，可取 `extensionsPage.locator('extensions-item')` 深入 shadow root 读 `#extension-toggle` / `aria-checked`；
2. 或保留常量但**改名为自述字段**，例如 `enabled: "by-construction: --load-extension loads enabled"`，把"测量值"与"构造事实"分开；
3. `dailyProfileTouched` 同理：把它改成"记录观测到的日常 profile 目录 mtime 前后值"（我已实测此法可行，见 §4），或明确标注 `by-construction`。

**按构造它应为真**：`--load-extension` 加载的扩展默认启用。所以这不是事实错误，是**证据链缺口**——而这正是本任务书里 P 系列反复在治的病。

---

## 3. 我未能核验的项：截图

`edge-temp-profile-extensions.png`（1280×720，51,801 B，PNG 头合法）是 **"开关处于开启状态"的唯一载体**。

**我读不了它**：本会话所绑定的模型不接受图像输入（`Read` 返回 "Media omitted from provider request because the selected model does not support image input"）。

**我也没有把它转 `judge` 智能体**：该智能体的职责范围被明确限定为 pptx/docx/xlsx/pdf/poster/chart 这几类交付物的视觉验收，**浏览器 UI 截图不在其列**——按范围规矩，不为了一张截图动用它。

**因此："开关开启"这一条在审查者侧记为「未核验」**，不得写成"已复核通过"。

**残余风险很小**，理由有二：`--load-extension` 默认启用；且 E2E 已证明扩展**功能上真的在跑**（service worker 上线、一键填充成功）。所以这条不影响任何结论，但必须**如实标注为未核验**，而不是含糊带过。

---

## 4. 一处弱匹配与一处无法归因的观察

**(a) 文案断言是「整页级」而非「卡片级」。** `bodyText.includes('删除' | '重新加载' | '详细信息' | '来自其他源')` 匹配的是整个页面文本，而非本扩展的卡片。在 `--disable-extensions-except` + `--load-extension` 的临时 profile 下本扩展大概率是唯一扩展，实践上没问题；但断言强度弱于"定位到该卡片再取文本"。记录在案，不建议为此返工。

**(b) 日常 profile 有 20:52–20:55 的写入，我无法归因。** 观测：

```
20:54  .../Edge/User Data/Default/ExtensionActivityEdge(-journal)
20:55  .../Edge/User Data/{ShaderCache,GrShaderCache,GraphiteDawnCache}/data_1
```

时间点在 GPT 的脚本运行（产物 mtime 19:54）之后、其报告落盘（20:52）前后；**我自己的复跑没有改变这些时间戳**（前后快照一致）。

审计脚本**按构造不可能**写到这里（`launchPersistentContext` 的 user-data-dir 指向 `mkdtemp` 目录）。最可能的解释是**用户当时自己在用 Edge**。

我把它记为**未归因观察**，不指控。但若你当时没有在用 Edge，建议问 GPT 那一刻是否还跑了别的东西——`ExtensionActivityEdge` 是扩展活动日志，值得一问。

---

## 5. 该记功的两处

1. **它纠正了我的措辞**：我说竞品正确率"**永久**不可测"，它改为"**当前约束下**不可测"。这个纠正对——缺的是一组约束（无共同页面、无相同档案、无独立 oracle、无运行竞品的授权），不是逻辑不可能。我采纳。
2. **它修正了自己的结论**：在报告 §4 里明确写"computer-use 在 GPT 当前会话仍返回 `nodeRepl.fetch request failed`；DeepSeek 在另一会话的只读探针已证明主机能力可用。因此应定性为'GPT 会话级连接故障'，不能外推为整机连接器不可用"——**主动收窄自己的主张范围**，这是好习惯。

---

## 6. 对关键路径的影响：无变化，但一条待办被消解

**关键路径未变**：仍等 **QWEN 完成 B-3** → 我复跑过审 → 签 F03/F04 → F01 出 oracle 草案 → GPT 独立审计。D1–D3 仍等用户的清单与 CDP 授权。

**但第三轮启动提示词 §6 的第 2 项可以销掉了**：原本要用户裁定"是否授权把扩展装进日常 profile"，现已证明**不需要装**——临时 profile 能拿到同一层级的 UI 证据。建议执行者在下一轮账本/任务书里记一句："Edge UI 级验证已由第三方审计员以临时 profile 完成（零足迹），不再需要日常 profile 安装授权；本案不改任务书编号，仅作事实登记。"

---

## 7. 结论

**接受为本项目的第一份"UI 级真机证据"，判定：核心主张成立、方法优于原提议、可复跑。** 附带两项须如实记录的缺口（`enabled`/`dailyProfileTouched` 为常量断言；截图未由审查者核验），二者均不影响结论，但**不得在后续文档里被写成"已复核"**。

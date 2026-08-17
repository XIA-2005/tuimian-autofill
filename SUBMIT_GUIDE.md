# 商店上架逐步指南

> 我能替你完成的部分已全部就绪（ZIP 包、截图、宣传图、文案、隐私政策）。以下步骤需要**你本人的账号**在浏览器里操作——这是无法代劳的部分。

## 一、Edge 加载项商店（推荐，免费）

### 1. 注册开发者（一次性，免费）
1. 用你的 Microsoft 账号登录 <https://partner.microsoft.com/>；
2. 选择「**Edge 扩展**」/ Add-ons 计划，按提示完成注册（免费，通常需要邮箱验证）。

### 2. 提交扩展
1. 进入 Partner Center → 「扩展」→「**创建新扩展**」；
2. **上传包**：选择 `release\tuimian-autofill-v1.0.0.zip`；
3. 填写**商店清单**（文案直接复制 `STORE_LISTING.md`）：
   - 名称：`预推免填表助手`
   - 简短描述 / 详细描述：见 `STORE_LISTING.md`
   - 类别：`效率` 或 `教育`
   - **隐私政策 URL**：先把你自己的隐私政策页面发布到网上（内容可用 `PRIVACY.md`；没有个人网站可用 GitHub Pages / Notion 公开页 / Gitee Pages 托管），把链接填进去
4. **截图与宣传图**（上传 `store-assets\` 下的文件）：
   - `screenshot-1-fill.png`（报名页填充效果，1280×800）
   - `screenshot-2-editor.png`（档案编辑器，1280×800）
   - `screenshot-3-popup.png`（工具栏弹窗，640×400）
   - `store-tile-440x280.png`（宣传图，如要求）
5. 补充审核备注（可选）：说明"仅在本机处理用户数据、无网络请求、不自动提交、验证码需人工"；
6. 点「**提交审核**」。审核通常 1~7 个工作日，通过后点「发布」。

### 3. 更新版本
改 `src\manifest.json` 的 `version`（如 1.0.1）→ `npm run package` → 在 Partner Center 上传新 ZIP 即可。

## 二、Chrome 网上应用店（可选）

1. 注册 Chrome Web Store 开发者账号（**$5 一次性费用**，需要 Google 账号）：<https://chrome.google.com/webstore/devconsole>；
2. 「新增项」→ 上传同一个 ZIP；
3. 清单、截图（1280×800）、隐私政策同上（内容见 `STORE_LISTING.md` / `PRIVACY.md`）；
4. 提交审核（数小时~数天）。

## 三、不上商店的替代分发（零门槛）

- 把 `release\tuimian-autofill-v1.0.0.zip` 直接发给同学：解压 → `edge://extensions` → 开发人员模式 → 「加载解压缩的扩展」选择解压目录；
- 或放到 GitHub 仓库 Release 页供下载（README 已含安装说明）。

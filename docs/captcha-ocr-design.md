# Captcha OCR 辅助模块设计方案

## 1. 目标与设计原则

- 为用户提供可选的本地验证码 OCR 识别能力，**默认完全关闭**，用户主动开启
- 识别结果始终**预览 1.5s 后自动填充**，保留人工取消权
- 两条路线：路线 A（tesseract.js WASM，纯浏览器）和路线 B（Python 桥接服务，PaddleOCR）
- 服务不可用时平滑降级，不影响其他填表功能

## 2. 模块架构

```
┌─────────────────────────────────────────────────────────────┐
│                    content.js (注入到所有页面)               │
│  ┌──────────────────┐  ┌──────────────────────┐          │
│  │ captcha-detector │  │ captcha-ocr (路线A)  │          │
│  │ - MutationObserver│  │ - tesseract.js lazy  │          │
│  │ - img+input 关联 │  │ - canvas 预处理       │          │
│  │ - ghost button   │  │ - 灰度/二值化         │          │
│  └────────┬─────────┘  └──────────────────────┘          │
│           │                                                │
│           │ bridge.ts (路线A直接调用 / 路线B走HTTP)          │
│           ▼                                                │
│  ┌──────────────────────────────────────────┐            │
│  │ captcha-bridge.ts                        │            │
│  │ route: 'A' → tesseract.js in-page        │            │
│  │ route: 'B' → POST localhost:18765/ocr     │            │
│  └──────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
        ▲
        │ storage.sync: { captchaEnabled, captchaRoute, ... }
        │
┌─────────────────────────────────────────────────────────────┐
│                   background.js (service_worker)           │
│  - 监听 captcha:recognize 消息                              │
│  - 路线A: 透传给 content script（content 自己跑 tesseract.js）│
│  - 路线B: 启动 Python 桥接服务（可选，检测端口 18765）        │
│  - 维护 captchaSettings 和 captchaHistory                   │
└─────────────────────────────────────────────────────────────┘
        ▲
        │ storage.sync
        │
┌─────────────────────────────────────────────────────────────┐
│                 options/captcha-settings.html               │
│  - 开关 OCR 服务（默认关闭）                                  │
│  - 选择路线 A / 路线 B                                       │
│  - 查看识别历史（最近 20 条）                                 │
│  - 识别准确率统计                                           │
└─────────────────────────────────────────────────────────────┘
```

## 3. 路线 A: tesseract.js（WASM）实现细节

### 3.1 懒加载策略
- 不在扩展加载时导入 tesseract.js，而是在**首次检测到验证码时**才动态 import
- 使用 `import('tesseract.js/dist/tesseract.esm.min.js')`，由 tesseract.js 内部加载 WASM
- 首次识别约 2-5 秒（下载 WASM + 初始化），后续识别 < 500ms

### 3.2 图像预处理（canvas）
```typescript
// 预处理步骤（提升识别准确率）：
// 1. 绘制原图到临时 canvas
// 2. 灰度化：遍历像素，Y = 0.299R + 0.587G + 0.114B
// 3. 二值化：threshold = Otsu's method 或固定 140
// 4. 可选：去噪（3x3 中值滤波）去除干扰线
// 5. 对比度增强：线性拉伸到 [50, 200]
```

### 3.3 tesseract.js 配置
```typescript
Tesseract.recognize(canvas, 'eng+chi_sim', {
  logger: (m) => { /* 进度回调 */ },
  ... // 默认配置
})
```

## 4. 路线 B: Python 桥接服务实现细节

### 4.1 协议设计（兼容竞品）
```
扩展 → 浏览器插件桥（localhost:18765 + token）
    ↓ HTTP POST /ocr
Python 桥接服务（PaddleOCR）
    ↓
baoyan-native.exe（子进程）
```

扩展内部 HTTP 客户端（fetch）：
```
POST http://localhost:18765/{token}/ocr
Content-Type: application/json
Body: { "image_base64": "...", "type": "captcha" }
Response: { "ok": true, "text": "ABC123", "confidence": 0.92 }
```

### 4.2 服务检测与启动
- 扩展启动时通过 `fetch('http://localhost:18765/health')` 检测 Python 桥接服务
- 若未运行且用户开启了路线 B，提示用户启动桥接服务
- 桥接服务不随扩展自动启动（用户手动启动或开机自启）

## 5. 验证码检测策略（captcha-detector）

### 5.1 静态检测（onload 时）
遍历页面所有 `<input type="text">` 或 `<input type="password">`，检查：
- 是否有 `maxlength` 属性且值为 4~6
- 同一父容器下是否有相邻的 `<img>` 元素（验证码图片）
- `placeholder` / `id` / `name` 是否包含 `captcha|verify|验证码|yzm|code`

### 5.2 动态检测（MutationObserver）
监听 `document.body` 的 `childList` 和 `subtree` 变化：
- 新增 `<img>` 元素时：查找同容器 `input[type="text"]`
- 新增 `<input>` 元素时：检查 `maxlength` + 相邻 `img`

### 5.3 候选输入框识别
```typescript
// 检测条件（同时满足）：
// 1. input.maxlength ∈ [4, 6]
// 2. 相邻（同父容器）存在 <img> 且 src 非空
// 3. input.value.length === 0（未填写）
```

## 6. UX 流程

```
检测到验证码 img + input
        ↓
检查 storage.captchaEnabled === true
        ↓ (是)
┌─ 路线 A: tesseract.js 路线 ─┐
│  检查 tesseract.js 已加载？  │
│  否 → 动态 import()        │
│  加载中 → 显示加载状态      │
│  是 → 进入识别流程          │
└────────────────────────────┘
        ↓
显示 ghost button（淡蓝色半透明「识别验证码」按钮）
        ↓
用户点击（或 auto_trigger = true 时自动）
        ↓
图像预处理（canvas 灰度/二值化）
        ↓
tesseract.js 识别（~1-3s）
        ↓
后处理：去除非字母数字 → 大写 → 长度截断(6)
        ↓
[1.5s 预览]
┌─ 在 input 上方显示半透明浮层：识别结果「ABC123」
│  倒计时 1.5s，若用户点击取消则回退
│  1.5s 后：写入 input.value 并触发 input 事件
└──────────────────────────────────
        ↓
记录到识别历史（storage.local: captchaHistory[]）
```

## 7. 数据存储

### storage.sync（设置）
```typescript
interface CaptchaSettings {
  enabled: boolean;       // 默认 false
  route: 'A' | 'B';      // 默认 'A'
  autoTrigger: boolean;   // 默认 false（需用户点击按钮）
  previewDuration: number; // 默认 1500ms
  routeBEndpoint: string; // 默认 'http://localhost:18765'
}
```

### storage.local（识别历史）
```typescript
interface CaptchaHistoryItem {
  id: string;           // 时间戳 UUID
  text: string;         // 识别结果
  confidence: number;   // 置信度 0-1
  source: 'A' | 'B';    // 路线
  url: string;          // 页面 URL
  timestamp: number;     // 时间戳
  used: boolean;        // 是否被用户采纳
}
```

## 8. manifest.json 改动

```diff
  "permissions": [
    "storage",
    "clipboardWrite",
+   "scripting"   // 路线 B 需要 scripting 注入 content script
  ],
+ "host_permissions": [
+   "http://localhost:18765/*"
+ ],
```

## 9. 验收标准

1. **文件完整性**：6 个新文件/改动，编译无错误
2. **降级完整性**：关闭时所有 captcha 代码路径不执行，不报错
3. **识别准确率**：5 种测试图 ≥ 70%（标准降质图，非极端干扰）
4. **预览流程**：识别后停留 1.5s，给用户取消机会
5. **竞品兼容性**：路线 B 协议与 native_service_cli.py OCR 命令兼容

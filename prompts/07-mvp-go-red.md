# MVP Go 二进制 · 漏填高亮 · 红阶段

## 元信息
- **阶段**：[TDD-PHASE: red]
- **目标文件**：`bridge/parse/xidian_test.go`
- **前置条件**：无
- **技术栈**：Go（竞品用 Python，我们用 Go 单二进制避免用户装环境）
- **通信**：浏览器 content script 用 fetch `http://127.0.0.1:18765` 调用
- **端口**：18765（与竞品对齐）
- **决策依据**：CONTEXT.md 决策 2-10

---

## 项目上下文

本扩展需要本地 Go 二进制做 HTML → JSON 解析（浏览器 content script 不擅长复杂 DOM 解析）。

**竞品痛点**：Python 嵌入需要用户装 Python 环境，`bridge.json 未找到` 报错率极高。
**我们的方案**：Go 单文件静态编译，用户无需装任何运行时。

API 端点：

```
GET  /ping                          → 返回 {"status": "ok", "version": "x.x.x"}
GET  /health                        → 返回 {"status": "ok", "timestamp": 1234567890}
POST /api/v1/parse
  Body: {"html": "<div>...</div>", "parser": "xidian-gsapp", "page": "basic"}
  → 返回 {"fields": [{"path": "basic.name", "value": "张三"}, ...]}
```

`xidian-gsapp` 解析器负责西电系统（`yjspt.xidian.edu.cn`）：
- `basic`：个人信息页（姓名、身份证、出生日期、民族、政治面貌、联系电话、邮箱）
- `awards`：获奖经历页（奖项名称、级别、时间）
- `research`：科研经历页（项目名称、角色、描述）

---

## 边界清单

1. **正常路径**：`basic` 页面 HTML 包含完整个人信息 → 返回 7+ 字段
2. **正常路径**：`awards` 页面 HTML 包含多条获奖记录 → 返回数组
3. **正常路径**：`research` 页面 HTML 包含项目记录 → 返回数组
4. **异常路径**：`parser` 为未知值 → 返回 `{"error": "unknown_parser"}`
5. **异常路径**：`html` 为空字符串 → 返回 `{"error": "empty_html"}`
6. **边界值**：HTML 中目标字段不存在（页面结构变化）→ 返回空数组，不报错
7. **边界值**：`page` 为 "awards" 但 HTML 是 basic 页结构 → 返回空数组

---

## 禁止条款

- 不准用正则硬编码解析 HTML（用 goquery）
- 不准启动真实 HTTP 服务器（在测试里用 httptest）
- 不准解析与西电无关的域名
- 不准返回任何用户个人信息（测试数据必须用 mock）

---

## 交付物

**文件**：`bridge/parse/xidian_test.go`

**执行命令**：

```bash
cd bridge && go test ./parse/... -run "Xidian" -v
```

**期望输出**：`FAIL`（因 `xidian.go` 尚未实现）

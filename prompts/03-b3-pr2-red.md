# 漏填高亮 · PR2 UI 渲染 · 红阶段

## 元信息
- **阶段**：[TDD-PHASE: red]
- **目标文件**：`src/content/highlight-ui.test.ts`
- **前置条件**：`src/core/highlight.ts` 已实现（PR1 已合并）
- **决策依据**：CONTEXT.md 决策 3、4

---

## 项目上下文

本项目是「预推免填表助手」浏览器扩展。
`highlight.ts` 已导出：

```typescript
// src/core/highlight.ts
function classifyFieldStatus(path: string, result: FillResult, profile: Profile): 'filled' | 'missing' | 'empty'
function buildHighlightMap(result: FillResult, profile: Profile): {
  green: string[];
  yellow: string[];
  red: string[];
}
```

页面渲染在 `src/content/` 下，使用原生 DOM API（无框架）。
三色高亮用 CSS 类标记：

| 颜色 | CSS 类 | 说明 |
|---|---|---|
| 绿色 | `tui-highlight-green` | 已填 |
| 黄色 | `tui-highlight-yellow` | 档案未填 |
| 红色 | `tui-highlight-red` | 需人工 |

CSS 类已在 `src/content/content.css` 中定义（不要改 CSS）。

字段 path 到 DOM 元素的映射：通过扫描页面 `<input>`, `<select>`, `<textarea>` 的 `name/id/label` 属性查找。

---

## 业务规则

- `renderHighlights(result, profile, container)` 函数：
  - 调用 `buildHighlightMap()` 得到三色 path 列表
  - 遍历 container 内所有表单控件
  - 给对应控件元素加上对应的 CSS 类
  - 返回 `{ green: number, yellow: number, red: number }` 统计
- `clearHighlights(container)` 函数：移除 container 内所有 `tui-highlight-*` 类
- 路径匹配策略：用 `data-tui-path` 属性（由 filler.ts 注入）精确匹配；若无则用 `name` 属性模糊匹配（包含即匹配）

---

## 边界清单

1. 页面无任何表单控件（统计全为 0）
2. 同一控件同时出现在 green 和 red 列表（应取 red，优先级最高）
3. 控件无 `data-tui-path` 属性但有 `name`（用 name 匹配）
4. 控件无 `data-tui-path` 也无 `name`（跳过，不报错）
5. container 为空（返回零统计）

---

## 禁止条款

- 不准改 `content.css`
- 不准改 `src/core/highlight.ts`
- 断言不准依赖具体控件 id/name/label，只用 `data-tui-path`
- 测试不准 mock DOM 查询，只用 jsdom

---

## 交付物

**文件路径**：`src/content/highlight-ui.test.ts`

**执行命令**：

```bash
npm test -- --grep "highlight-ui"
```

**期望输出**：`FAIL`（因 `highlight-ui.ts` 尚未实现）

# 漏填高亮 · PR2 UI 渲染 · 绿阶段

## 元信息
- **阶段**：[TDD-PHASE: green]
- **目标文件**：`src/content/highlight-ui.ts`
- **前置条件**：`src/content/highlight-ui.test.ts` 已写完且 `npm test -- --grep "highlight-ui"` 为 RED
- **禁止**：不准看 `highlight-ui.test.ts` 以外的任何测试文件
- **决策依据**：CONTEXT.md 决策 3、4

---

## 项目上下文

本项目是「预推免填表助手」浏览器扩展。
`highlight.ts` 已导出：

```typescript
function buildHighlightMap(result: FillResult, profile: Profile): {
  green: string[];
  yellow: string[];
  red: string[];
}
```

三色 CSS 类：`tui-highlight-green` / `tui-highlight-yellow` / `tui-highlight-red`（已在 `content.css` 定义）。

---

## 业务规则

- `renderHighlights(result, profile, container)`：
  - 调用 `buildHighlightMap()`
  - 遍历 container 内 `<input>`, `<select>`, `<textarea>`
  - 精确匹配 `data-tui-path` 或模糊匹配 `name`
  - 红色优先级最高（同一控件同时在绿/红列表时，取红色）
  - 返回 `{ green: number, yellow: number, red: number }`
- `clearHighlights(container)`：移除所有 `tui-highlight-*` 类

---

## 禁止条款

- 不准改 CSS
- 不准改 `src/core/highlight.ts`
- 不准 mock DOM 查询

---

## 交付物

**文件路径**：`src/content/highlight-ui.ts`

**执行命令**：

```bash
npm test -- --grep "highlight-ui"
```

**期望输出**：`PASS`

# 漏填高亮 · PR1 核心逻辑 · 绿阶段

## 元信息
- **阶段**：[TDD-PHASE: green]
- **目标文件**：`src/core/highlight.ts`
- **前置条件**：`src/core/highlight.test.ts` 已写完且 `npm test -- --grep "highlight"` 为 RED
- **禁止**：不准看 `highlight.test.ts` 以外任何已实现代码
- **决策依据**：CONTEXT.md 决策 3、4

---

## 项目上下文

本项目是「预推免填表助手」浏览器扩展。
用户档案结构：

```typescript
interface Profile {
  basic: {
    name?: string;
    idCard?: string;
    phone?: string;
    email?: string;
    birthday?: string;
    nationality?: string;
    ethnicity?: string;
    politicalStatus?: string;
  };
  education: {
    university?: string;
    major?: string;
    gpa?: string;
    rank?: string;
    rankTotal?: number;
    province?: string;
  };
  awards: Array<{ name: string; level: string; date: string }>;
  research: Array<{ title: string; role: string; description: string }>;
  _fieldStates: Record<string, { locked: boolean; source: string }>;
}

interface FillResult {
  filledFields: Array<{ path: string; value: string; driver: string }>;
  failedFields: Array<{ path: string; reason: string; driver: string }>;
  skippedFields: Array<{ path: string; reason: string }>;
}
```

---

## 业务规则

| 颜色 | 语义 | 判断条件 |
|---|---|---|
| 绿色 | 已填 | filledFields 有该 path 且 _fieldStates[path].locked === false |
| 黄色 | 档案未填 | 该 path 不在 filledFields 中且 profile 中该字段值为空/undefined 且不在 failedFields 中 |
| 红色 | 需人工 | 该 path 在 failedFields 中或档案有值但 fillResult 未填充 |

**关键不变量**：
- 同一 path 三色互斥
- 绿色和红色字段一定是 fillResult 里出现过的 path
- 黄色字段是档案有路径但从未出现在 fillResult 里
- locked === true 的字段不参与三色判定（保持原样）

---

## 禁止条款

- 不准看 highlight.test.ts 以外的任何测试文件
- 不准改 highlight.test.ts
- 不准引入 DOM/CSS/UI 相关代码
- 不准写 export default

---

## 交付物

**文件路径**：`src/core/highlight.ts`

**必须导出**：
```typescript
function classifyFieldStatus(path: string, result: FillResult, profile: Profile): 'filled' | 'missing' | 'empty'
function buildHighlightMap(result: FillResult, profile: Profile): {
  green: string[];
  yellow: string[];
  red: string[];
}
```

**执行命令**：

```bash
npm test -- --grep "highlight"
```

**期望输出**：`PASS`（全部测试 green）

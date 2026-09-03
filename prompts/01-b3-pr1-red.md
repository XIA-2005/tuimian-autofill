# 漏填高亮 · PR1 核心逻辑 · 红阶段

## 元信息
- **阶段**：[TDD-PHASE: red]
- **目标文件**：`src/core/highlight.ts` + `src/core/highlight.test.ts`
- **前置条件**：无（纯独立模块，不依赖任何已实现代码）
- **决策依据**：CONTEXT.md 决策 3、4

---

## 项目上下文

本项目是「预推免填表助手」浏览器扩展（Edge/Chrome，Manifest V3）。
用户档案（profile）存储在 `chrome.storage.local`，结构如下：

```typescript
// 简化结构（实际见 src/core/profile.ts）
interface Profile {
  basic: {
    name?: string;
    idCard?: string;
    phone?: string;
    email?: string;
    birthday?: string;     // YYYY-MM-DD
    nationality?: string;
    ethnicity?: string;
    politicalStatus?: string;
  };
  education: {
    university?: string;
    major?: string;
    gpa?: string;
    rank?: string;          // "3/120" 格式
    rankTotal?: number;
    province?: string;
  };
  awards: Array<{ name: string; level: string; date: string }>;
  research: Array<{ title: string; role: string; description: string }>;
  // ... 其他 8 类原子表
  _fieldStates: Record<string, { locked: boolean; source: string }>;
}
```

填充结果（fillResult）来自 `src/core/filler.ts` 的 `SafeFillResult`：

```typescript
interface FillResult {
  filledFields: Array<{ path: string; value: string; driver: string }>;
  failedFields: Array<{ path: string; reason: string; driver: string }>;
  skippedFields: Array<{ path: string; reason: string }>;
}
```

---

## 业务规则

漏填高亮的三色语义：

| 颜色 | 语义 | 判断条件 |
|---|---|---|
| 绿色 | 已填 | `fillResult.filledFields` 中存在该 path **且** `profile._fieldStates[path].locked === false` |
| 黄色 | 档案未填 | 该 path 不在 `filledFields` 中 **且** profile 中该字段值为空/undefined **且** 不在 `failedFields` 中 |
| 红色 | 需人工 | 该 path 在 `fillResult.failedFields` 中 **或** 档案有值但 fillResult 没有填充（字段识别了但推导失败） |

**关键不变量**：
- 绿色和红色字段**一定是** fillResult 里出现过的 path。
- 黄色字段**一定是**档案有路径但从未出现在 fillResult 里。
- 同一 path 三色互斥。

---

## 边界清单（必须全部覆盖）

1. **正常路径**：字段已填（绿色）
2. **正常路径**：字段填充失败（红色）
3. **正常路径**：字段档案为空且未参与填充（黄色）
4. **边界值**：字段在 filledFields 和 failedFields 同时出现（应取红色）
5. **边界值**：字段 path 含数组下标，如 `awards[0].name`（解析正确）
6. **边界值**：_fieldStates 为空对象（无锁定记录）
7. **边界值**：_fieldStates 中该字段 locked === true（永不标绿/红/黄，应保持原样）

---

## 禁止条款

- 不准引用 `src/content/` 下的任何文件
- 不准引入 DOM/CSS 相关代码
- 测试断言不准硬编码具体人名/身份证号
- 不准写 `export default`，只用命名导出
- 测试不准 mock `profile._fieldStates`，必须用真实数据

---

## 交付物

**文件路径**：`src/core/highlight.test.ts`

**必须包含**：
- `classifyFieldStatus()` 测试（覆盖全部 7 个边界 case）
- `buildHighlightMap()` 测试（输入 fillResult + profile，输出 `{ green: string[], yellow: string[], red: string[] }`）

**执行命令**（写完后运行）：

```bash
npm test -- --grep "highlight"
```

**期望输出**：`FAIL`（因 `highlight.ts` 尚未实现，测试应全部 red）

# v2.5 TDD 工具链工程化 · 红阶段

## 元信息
- **阶段**：[TDD-PHASE: red]
- **目标文件**：`prompts/tdd-prompt-generator.test.ts` + `prompts/validate-tdd-prompt.ts`
- **前置条件**：无
- **决策依据**：CONTEXT.md 决策 1

---

## 项目上下文

本项目需要一套 TDD 提示词工程化工具链：
- `.cursorrules`：AI 协作铁律（写入决策 1 的 4 条铁律）
- `prompts/tdd-prompt-generator.test.ts`：自动生成标准化提示词的脚本
- `prompts/validate-tdd-prompt.ts`：验证提示词是否符合 6 段式结构的检查脚本

6 段式结构：
```
[阶段标记]
[项目上下文]
[业务规则]
[边界清单]
[禁止条款]
[交付物]
```

---

## 边界清单

1. 缺少 `[阶段标记]` 行 → 报错
2. 缺少 `[交付物]` 段落 → 报错
3. `[禁止条款]` 中有矛盾指令（如"不准改 XX"但 XX 不在上下文中）→ 警告
4. 提示词总长度 < 500 字 → 警告（可能缺少业务规则）
5. `[边界清单]` 数量 < 3 → 报错
6. 路径不以 `src/` 或 `bridge/` 开头 → 报错

---

## 禁止条款

- 不准生成非 6 段式结构的内容
- 验证脚本不准修改任何 `prompts/` 下的 `.md` 文件
- 测试不准 mock 文件系统

---

## 交付物

**文件**：`prompts/validate-tdd-prompt.ts`

**执行命令**：

```bash
npx ts-node prompts/validate-tdd-prompt.ts prompts/01-b3-pr1-red.md
```

**期望输出**：`FAIL`（validate 脚本尚未实现）

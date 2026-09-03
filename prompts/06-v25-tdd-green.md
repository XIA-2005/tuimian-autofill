# v2.5 TDD 工具链工程化 · 绿阶段

## 元信息
- **阶段**：[TDD-PHASE: green]
- **目标文件**：`prompts/validate-tdd-prompt.ts`
- **前置条件**：`prompts/validate-tdd-prompt.ts.test` 已写完且运行 FAIL
- **禁止**：不准看 prompts 目录以外的测试文件

---

## 业务规则

6 段式验证规则（详见红阶段）：
1. 缺少 `[阶段标记]` 行 → 报错
2. 缺少 `[交付物]` 段落 → 报错
3. `[禁止条款]` 中有矛盾指令 → 警告
4. 提示词总长度 < 500 字 → 警告
5. `[边界清单]` 数量 < 3 → 报错
6. 路径不以 `src/` 或 `bridge/` 开头 → 报错

---

## 交付物

**文件**：`prompts/validate-tdd-prompt.ts`

**执行命令**：

```bash
npx ts-node prompts/validate-tdd-prompt.ts prompts/01-b3-pr1-red.md
```

期望：无报错（该提示词符合 6 段式）。

```bash
npx ts-node prompts/validate-tdd-prompt.ts prompts/03-b3-pr2-red.md
```

期望：无报错。

```bash
npx ts-node prompts/validate-tdd-prompt.ts "prompts/00-bad-example.md"
```

期望：至少 2 个 ERROR。

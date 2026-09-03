# prompts/ — TDD 提示词集使用说明

## 工作流

每个功能模块需要 **两个 AI 会话**：

```
会话 A（红）                          会话 B（绿）
─────────────────                     ─────────────────
粘贴 prompts/XX-xxx-red.md   →        粘贴 prompts/XX-xxx-green.md
→ AI 写测试                          → AI 写实现
→ 你运行测试，确认 FAIL               → 你运行测试，确认 PASS
→ 提交 PR                            → 提交 PR
```

## 文件清单

| 文件 | 阶段 | 目标 |
|---|---|---|
| `01-b3-pr1-red.md` | 红 | 漏填高亮核心逻辑测试 |
| `02-b3-pr1-green.md` | 绿 | 漏填高亮核心逻辑实现 |
| `03-b3-pr2-red.md` | 红 | 漏填高亮 UI 渲染测试 |
| `04-b3-pr2-green.md` | 绿 | 漏填高亮 UI 渲染实现 |
| `05-v25-tdd-red.md` | 红 | TDD 工具链验证脚本测试 |
| `06-v25-tdd-green.md` | 绿 | TDD 工具链验证脚本实现 |
| `07-mvp-go-red.md` | 红 | MVP Go 二进制解析器测试 |
| `08-mvp-go-green.md` | 绿 | MVP Go 二进制解析器实现 |

## PR 顺序

1. **PR 1**：`01-red` → `02-green`（漏填高亮核心）
2. **PR 2**：`03-red` → `04-green`（漏填高亮 UI，依赖 PR1）
3. **PR 3**：`05-red` → `06-green`（TDD 工具链，v2.5）
4. **PR 4**：`07-red` → `08-green`（Go 二进制 MVP，4-5 周）

## 铁律速查

- `[TDD-PHASE: red]` 的提示词不准写任何实现代码
- 测试写完必须运行，确认 FAIL 才能进入绿阶段
- 断言用业务规则，不用示例值
- 正常路径 / 异常路径 / 边界值 各 ≥ 1 case

# MVP Go 二进制 · 漏填高亮 · 绿阶段

## 元信息
- **阶段**：[TDD-PHASE: green]
- **目标文件**：`bridge/parse/xidian.go`
- **前置条件**：`bridge/parse/xidian_test.go` 已写完且 `go test` 为 FAIL
- **禁止**：不准看 xidian_test.go 以外的测试文件

---

## 技术规范

- HTTP 框架：`net/http` + `github.com/PuerkitoBio/goquery`
- 测试框架：`testing` + `net/http/httptest`
- 端口：18765
- 竞品对齐：竞品 Python 桥接层 `/api/v1/parse` 入口兼容

---

## 交付物

**文件**：`bridge/parse/xidian.go`

**执行命令**：

```bash
cd bridge && go test ./parse/... -run "Xidian" -v
```

**期望输出**：`PASS`

```bash
cd bridge && go build -o baoyan-bridge.exe
./baoyan-bridge.exe &
curl -s http://127.0.0.1:18765/ping
```

**期望输出**：`{"status":"ok","version":"x.x.x"}`

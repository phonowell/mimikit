# 运行接口

> 返回 [系统设计总览](./README.md)

## HTTP API
- GET / → WebUI
- GET /api/status
- POST /api/input（支持可选字段：clientLocale / clientTimeZone / clientOffsetMinutes / clientNowIso / language）
- GET /api/messages?limit=...
- GET /api/messages/export?limit=...（导出人类可读 markdown）
- GET /api/tasks?limit=...
- POST /api/restart
- POST /api/reset

实现：`src/http/index.ts`；WebUI 静态文件在 `src/webui/`。

## CLI
- `tsx src/cli.ts`
- `tsx src/cli.ts --port 8787`
- `tsx src/cli.ts --state-dir .mimikit --work-dir .`

### 回放评测 CLI
- `pnpm replay:eval -- --suite test/fixtures/replay/manager-core.json --out .mimikit/generated/replay/last.json --md .mimikit/generated/replay/last.md`
- 必填：`--suite` `--out`
- 可选：`--md` `--model` `--seed` `--temperature` `--offline` `--prefer-archive` `--archive-dir` `--max-fail` `--timeout-ms` `--state-dir` `--work-dir`
- 退出码：`0` 全通过，`1` 断言失败，`2` 运行错误/样本格式错误

### 环境变量
- `MIMIKIT_MODEL`：覆盖 manager model（默认 `gpt-5.2-high`）
- `MIMIKIT_WORKER_MODEL`：覆盖 worker model（默认 `gpt-5.3-codex-high`）
- `MIMIKIT_REASONING_EFFORT`：设置 manager reasoning effort（`minimal|low|medium|high|xhigh`）

### 默认配置（节选）
- `manager.pollMs = 1000`
- `manager.debounceMs = 10000`
- `manager.maxResultWaitMs = 20000`
- `manager.tasksMaxCount = 20`
- `manager.tasksMinCount = 5`
- `manager.tasksMaxBytes = 20480`

说明：manager 已对 tasks 与 history 都按 `min/max/maxBytes` 窗口裁剪后再注入 prompt。

定义位置：`src/config.ts`

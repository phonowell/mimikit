# 运行接口

> 返回 [系统设计总览](./README.md)

## HTTP API
- GET / → WebUI
- GET /api/status
- POST /api/input（支持可选字段：clientLocale / clientTimeZone / clientOffsetMinutes / clientNowIso / language）
- GET /api/messages?limit=...
- GET /api/tasks?limit=...
- POST /api/restart
- POST /api/reset

实现：`src/http/index.ts`；WebUI 静态文件在 `src/webui/`。

## CLI
- `tsx src/cli.ts`
- `tsx src/cli.ts --port 8787`
- `tsx src/cli.ts --state-dir .mimikit --work-dir .`

### 环境变量
- `MIMIKIT_MODEL`：覆盖 manager model（默认 `gpt-5.2-xhigh`）
- `MIMIKIT_WORKER_MODEL`：覆盖 worker model（默认 `gpt-5.3-codex-xhigh`）
- `MIMIKIT_REASONING_EFFORT`：设置 manager reasoning effort（`minimal|low|medium|high|xhigh`）

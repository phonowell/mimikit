# 运行接口

> 返回 [系统设计总览](./README.md)

## HTTP API
- GET / → WebUI
- GET /api/status
- POST /api/input
- GET /api/messages?limit=...
- GET /api/tasks?limit=...
- POST /api/restart

实现：`src/http/handler.ts`；WebUI 静态文件在 `src/webui/`。

## CLI
- `tsx src/cli.ts`
- `tsx src/cli.ts --port 8787`
- `tsx src/cli.ts --state-dir .mimikit --work-dir .`

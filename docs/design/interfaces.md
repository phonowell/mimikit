# 运行接口

> 返回 [系统设计总览](./README.md)

## HTTP API
- GET / → WebUI
- GET /api/status
- POST /api/input
- GET /api/messages?limit=...
- GET /api/tasks?limit=...
- GET /api/runs?kind=task|trigger&id=...&limit=...
- POST /api/restart

### 认证
若配置 `MIMIKIT_API_KEY`，除 `/api/status` 外其余 `/api/*` 需携带：
- `Authorization: Bearer <token>` 或
- `X-Mimikit-Token: <token>`

实现：src/http/handler.ts；WebUI 静态文件在 src/webui/。

## CLI
- tsx src/cli.ts
- tsx src/cli.ts --port 8787
- tsx src/cli.ts memory status|index|search
- tsx src/cli.ts runs --kind task|trigger --id <id> --limit 50

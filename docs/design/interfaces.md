# 运行接口

> 返回 [系统设计总览](./README.md)

## HTTP API
- `GET /api/status`
- `POST /api/input`
- `GET /api/messages?limit=...`
- `GET /api/messages/export?limit=...`
- `GET /api/tasks?limit=...`
- `GET /api/tasks/:id/archive`
- `GET /api/tasks/:id/progress`
- `POST /api/tasks/:id/cancel`
- `POST /api/restart`
- `POST /api/reset`

实现位置：`src/http/index.ts`、`src/http/routes-api.ts`。

## CLI
- `tsx src/cli.ts`
- `tsx src/cli.ts --port 8787`
- `tsx src/cli.ts --state-dir .mimikit --work-dir .`

## 环境变量（核心）
- `MIMIKIT_MODEL`（覆盖 teller/thinker/worker.standard）
- `MIMIKIT_TELLER_MODEL`
- `MIMIKIT_THINKER_MODEL`
- `MIMIKIT_WORKER_MODEL`（兼容：映射到 worker.expert）
- `MIMIKIT_WORKER_STANDARD_MODEL`
- `MIMIKIT_WORKER_EXPERT_MODEL`
- `MIMIKIT_REASONING_EFFORT`（覆盖全角色）
- `MIMIKIT_TELLER_REASONING_EFFORT`
- `MIMIKIT_THINKER_REASONING_EFFORT`
- `MIMIKIT_WORKER_REASONING_EFFORT`（兼容：映射到 worker.expert）
- `MIMIKIT_WORKER_STANDARD_REASONING_EFFORT`
- `MIMIKIT_WORKER_EXPERT_REASONING_EFFORT`

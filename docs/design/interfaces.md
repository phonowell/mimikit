# 运行接口（当前实现）

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

实现位置：`src/http/index.ts`、`src/http/routes-api.ts`

## CLI
- `tsx src/cli/index.ts`
- `tsx src/cli/index.ts --port 8787`
- `tsx src/cli/index.ts --state-dir .mimikit --work-dir .`

## 环境变量（核心）
- `MIMIKIT_MODEL`（覆盖 `manager + worker.standard`）
- `MIMIKIT_MANAGER_MODEL`
- `MIMIKIT_WORKER_STANDARD_MODEL`
- `MIMIKIT_WORKER_SPECIALIST_MODEL`
- `MIMIKIT_REASONING_EFFORT`（覆盖 `manager + worker.*`）
- `MIMIKIT_MANAGER_REASONING_EFFORT`
- `MIMIKIT_WORKER_STANDARD_REASONING_EFFORT`
- `MIMIKIT_WORKER_SPECIALIST_REASONING_EFFORT`
- `MIMIKIT_MANAGER_POLL_MS`
- `MIMIKIT_MANAGER_MIN_INTERVAL_MS`
- `MIMIKIT_MANAGER_MAX_BATCH`
- `MIMIKIT_MANAGER_QUEUE_COMPACT_MIN_PACKETS`
- `MIMIKIT_MANAGER_TASK_SNAPSHOT_MAX_COUNT`
- `MIMIKIT_EVOLVER_POLL_MS`
- `MIMIKIT_EVOLVER_IDLE_THRESHOLD_MS`
- `MIMIKIT_EVOLVER_MIN_INTERVAL_MS`
- `MIMIKIT_REPORTING_DAILY_ENABLED`
- `MIMIKIT_REPORTING_RUNTIME_HIGH_LATENCY_MS`
- `MIMIKIT_REPORTING_RUNTIME_HIGH_USAGE_TOTAL`
- `MIMIKIT_FALLBACK_MODEL`

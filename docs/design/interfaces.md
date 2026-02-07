# 运行接口

> 返回 [系统设计总览](./README.md)

## HTTP API
- GET /
- GET /api/status
- POST /api/input
- GET /api/messages?limit=...
- GET /api/messages/export?limit=...
- GET /api/tasks?limit=...
- GET /api/tasks/:id/archive
- POST /api/tasks/:id/cancel
- POST /api/restart
- POST /api/reset

实现位置：`src/http/index.ts`

## CLI
- `tsx src/cli.ts`
- `tsx src/cli.ts --port 8787`
- `tsx src/cli.ts --state-dir .mimikit --work-dir .`

## 环境变量（节选）
- `MIMIKIT_MODEL`
- `MIMIKIT_WORKER_MODEL`
- `MIMIKIT_REASONING_EFFORT`
- `MIMIKIT_EVOLVE_IDLE_REVIEW_ENABLED`
- `MIMIKIT_EVOLVE_IDLE_REVIEW_INTERVAL_MS`
- `MIMIKIT_EVOLVE_IDLE_REVIEW_HISTORY_COUNT`
- `MIMIKIT_EVOLVE_RUNTIME_HIGH_LATENCY_MS`
- `MIMIKIT_EVOLVE_RUNTIME_HIGH_USAGE_TOTAL`

以下变量已废弃并忽略：
- `MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE`
- `MIMIKIT_EVOLVE_MAX_ROUNDS`
- `MIMIKIT_EVOLVE_MIN_PASS_RATE_DELTA`
- `MIMIKIT_EVOLVE_MIN_TOKEN_DELTA`
- `MIMIKIT_EVOLVE_MIN_LATENCY_DELTA_MS`
- `MIMIKIT_EVOLVE_FEEDBACK_SUITE_MAX_CASES`

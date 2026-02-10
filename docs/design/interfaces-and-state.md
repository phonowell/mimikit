# 接口与状态目录（当前实现）

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

## 核心环境变量
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

## 状态目录
默认目录：`./.mimikit/`

- `history.jsonl`：对话历史
- `log.jsonl`：运行日志
- `runtime-state.json`：任务快照 + reporting + queue cursor
- `inputs/packets.jsonl`：待消费用户输入
- `inputs/state.json`：`managerCursor`
- `results/packets.jsonl`：待消费任务结果
- `results/state.json`：`managerCursor`
- `tasks/tasks.jsonl`：任务快照流
- `feedback.md`
- `user_profile.md`
- `agent_persona.md`
- `agent_persona_versions/*.md`
- `task-progress/{taskId}.jsonl`
- `task-checkpoints/{taskId}.json`
- `tasks/YYYY-MM-DD/*.md`（任务结果归档）
- `llm/YYYY-MM-DD/*.txt`（LLM 调用归档）
- `reporting/events.jsonl`
- `reports/daily/YYYY-MM-DD.md`

## schema 约束
- runtime-state schema：`src/storage/runtime-state-schema.ts`
- `runtime-state.queues` 仅包含：
  - `inputsCursor`
  - `resultsCursor`
- 旧 `channels.*` 字段不再兼容。

queue state 约束：
- `managerCursor` 必须是非负整数。
- 落盘：`inputs/state.json`、`results/state.json`。


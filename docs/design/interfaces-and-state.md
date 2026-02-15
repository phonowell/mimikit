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

实现：`src/http/index.ts`、`src/http/routes-api.ts`

## CLI
- `tsx src/cli/index.ts`
- `tsx src/cli/index.ts --port 8787`
- `tsx src/cli/index.ts --work-dir .mimikit`

## 核心环境变量
- `MIMIKIT_MODEL`
- `MIMIKIT_MANAGER_MODEL`
- `MIMIKIT_WORKER_STANDARD_MODEL`
- `MIMIKIT_WORKER_SPECIALIST_MODEL`
- `MIMIKIT_REASONING_EFFORT`
- `MIMIKIT_WORKER_SPECIALIST_REASONING_EFFORT`
- `MIMIKIT_MANAGER_PROMPT_MAX_TOKENS`
- `MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS`
- `MIMIKIT_EVOLVER_ENABLED`
- `MIMIKIT_EVOLVER_POLL_MS`
- `MIMIKIT_EVOLVER_IDLE_THRESHOLD_MS`
- `MIMIKIT_EVOLVER_MIN_INTERVAL_MS`

## 状态目录
默认目录：`./.mimikit/`

- `history.jsonl`
- `log.jsonl`
- `runtime-state.json`
- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `wakes/packets.jsonl`
- `tasks/tasks.jsonl`
- `task-progress/{taskId}.jsonl`
- `tasks/YYYY-MM-DD/*.md`
- `llm/YYYY-MM-DD/*.txt`
- `user_profile.md`
- `agent_persona.md`
- `agent_persona_versions/*.md`

## Runtime Snapshot 约束
- schema：`src/storage/runtime-state-schema.ts`
- `runtime-state.queues` 仅包含：
  - `inputsCursor`
  - `resultsCursor`
  - `wakesCursor`
- 主会话恢复字段：
  - `plannerSessionId`
- 旧 grouped channel 结构不再兼容解析。

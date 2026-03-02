# 接口与状态目录（当前实现）

> 返回 [系统设计总览](../README.md)

## HTTP API（`src/http/*`）

- `GET /api/events`
- `GET /api/status`
- `POST /api/input`
- `DELETE /api/messages/:id`
- `GET /api/tasks/:id/archive`
- `POST /api/tasks/:id/cancel`
- `POST /api/choices/:id/select`
- `POST /api/restart`
- `POST /api/reset`

## SSE 事件模型（`GET /api/events`）

- `snapshot`：全量快照，包含 `status/messages/tasks/plans/focuses/choice/stream`。
- `stream`：流式文本 patch（`clear | replace | delta`）。
- `error`：SSE 连接内错误反馈。

说明：当前实现通过 SSE 下发消息、任务、plans 与 focus，不提供独立 `messages/tasks/plans` HTTP 查询接口。

## 输入协议（`POST /api/input`）

请求体（`parseInputBody`）：

- 必填：`text`
- 可选：`quote`、`language`
- 可选客户端上下文：`clientLocale`、`clientTimeZone`、`clientOffsetMinutes`、`clientNowIso`

## CLI 入口

- `pnpm start`
- `tsx src/cli/index.ts --port 8787 --work-dir .mimikit`

## 环境变量（`src/cli/env.ts`）

- `MIMIKIT_MODEL`
- `MIMIKIT_MANAGER_MODEL`
- `MIMIKIT_WORKER_MODEL`
- `MIMIKIT_REASONING_EFFORT`
- `MIMIKIT_WORKER_REASONING_EFFORT`
- `MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS`
- `MIMIKIT_MANAGER_IDLE_TRIGGER_DELAY_MS`
- `MIMIKIT_MANAGER_PLAN_WINDOW_MAX_COUNT`
- `MIMIKIT_MANAGER_PLAN_WINDOW_MIN_COUNT`

## 配置结构（`config/default.yaml`）

- `manager.model`
- `manager.maxCorrectionRounds`
- `manager.promptSections.*`
- `manager.taskCreate.debounceMs`
- `manager.idleTrigger.delayMs`
- `manager.taskWindow.{maxCount,minCount}`
- `manager.planWindow.{maxCount,minCount}`
- `worker.maxConcurrent`
- `worker.retry.{maxAttempts,backoffMs}`
- `worker.timeoutMs`
- `worker.model`
- `worker.modelReasoningEffort`

## 状态目录（默认 `./.mimikit/`）

- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `tasks/tasks.jsonl`
- `task-progress/{taskId}.jsonl`
- `tasks/YYYY-MM-DD/*.md`
- `traces/YYYY-MM-DD/<ts36><ra>.txt`
- `history/YYYY-MM-DD.jsonl`
- `memory/MEMORY.md`
- `generated/*`（由 `/artifacts/*` 静态路由暴露）
- `runtime-snapshot.json`
- `runtime-snapshot.json.bak`
- `log.jsonl`

说明：
- manager 每轮会直接注入 `M:memory`
- `memory/MEMORY.md` 由后台 memory 刷新子进程维护（`>=20` 轮触发，单飞执行）

## Runtime Snapshot 关键字段

schema：`src/storage/runtime-snapshot-schema.ts`

- `tasks`
- `taskPlans`
- `focuses`、`focusContexts`、`activeFocusIds`
- `managerTurn`、`managerCompressedContext`
- `memoryRefresh`（刷新检查点）
- `queues.inputsCursor`、`queues.resultsCursor`
- `pendingUserChoice`

## 重启语义

- `POST /api/restart` 与 `POST /api/reset` 都是“先回包，再异步停机”。
- 停机阶段会等待 in-flight manager 批次收敛，再持久化 snapshot 并退出。
- `reset` 会在持久化后清空状态目录并重建。

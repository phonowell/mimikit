# 接口与状态目录（当前实现）

> 返回 [系统设计总览](../README.md)

## HTTP API（`src/http/*`）

- `GET /api/events`
- `GET /api/status`
- `POST /api/input`
- `GET /api/tasks/:id/archive`
- `POST /api/tasks/:id/cancel`
- `POST /api/restart`
- `POST /api/reset`

实现入口：

- `src/http/index.ts`
- `src/http/routes-api.ts`
- `src/http/routes-api-events.ts`
- `src/http/routes-api-task-archive.ts`
- `src/http/routes-api-task-cancel.ts`
- `src/http/route-params.ts`
- `src/http/helpers.ts`

## SSE 事件模型（`GET /api/events`）

- `snapshot`：全量快照，包含 `status/messages/tasks/intents/focuses/stream`。
- `stream`：流式文本 patch（`clear | replace | delta`）。
- `error`：SSE 连接内错误反馈。

说明：当前实现通过 SSE 下发消息、任务、intents 与 focus，不再提供独立 `messages/tasks/intents` HTTP 查询接口。

## 输入协议（`POST /api/input`）

请求体（见 `parseInputBody`）：

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
- `MIMIKIT_MANAGER_PROMPT_MAX_TOKENS`
- `MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS`
- `MIMIKIT_MANAGER_INTENT_WINDOW_MAX_COUNT`
- `MIMIKIT_MANAGER_INTENT_WINDOW_MIN_COUNT`
- `MIMIKIT_MANAGER_INTENT_WINDOW_MAX_BYTES`

## 配置结构（`config/default.yaml`）

- `manager.model`
- `manager.maxCorrectionRounds`
- `manager.prompt.maxTokens`
- `manager.taskCreate.debounceMs`
- `manager.taskWindow.{maxCount,minCount,maxBytes}`
- `manager.intentWindow.{maxCount,minCount,maxBytes}`
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
- `runtime-snapshot.json`
- `runtime-snapshot.json.bak`
- `log.jsonl`
- `user_profile.md`
- `agent_persona.md`
- `agent_persona_versions/*.md`

说明：
- `M:write_user_profile` 写入 `user_profile.md`
- `M:write_persona` 写入 `agent_persona.md`，并在内容变化时落 `agent_persona_versions/*.md` 版本备份

## Runtime Snapshot 关键字段

schema：`src/storage/runtime-snapshot-schema.ts`

- `tasks`、`cronJobs`
- `idleIntents`、`idleIntentArchive`
- `focuses`、`focusContexts`、`activeFocusIds`
- `managerTurn`、`managerCompressedContext`
- `queues.inputsCursor`、`queues.resultsCursor`

## 重启语义

- `POST /api/restart` 与 `POST /api/reset` 都是“先回包，再异步停机”。
- 停机阶段会等待 in-flight manager 批次收敛，再持久化 snapshot 并退出。
- `reset` 会在持久化后清空状态目录并重建。

# 接口与状态目录（当前实现）

> 返回 [系统设计总览](../README.md)

## HTTP API

- `GET /api/events`
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

实现：`src/http/index.ts`、`src/http/routes-api.ts`、`src/http/routes-api-sections.ts`

## CLI

- `tsx src/cli/index.ts`
- `tsx src/cli/index.ts --port 8787`
- `tsx src/cli/index.ts --work-dir .mimikit`

## 核心环境变量

- `MIMIKIT_MODEL`
- `MIMIKIT_MANAGER_MODEL`
- `MIMIKIT_WORKER_MODEL`
- `MIMIKIT_REASONING_EFFORT`
- `MIMIKIT_WORKER_REASONING_EFFORT`
- `MIMIKIT_MANAGER_PROMPT_MAX_TOKENS`
- `MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS`

## 配置结构（`config/default.yaml`）

- `manager`
  - `model`：manager 默认模型（`MIMIKIT_MODEL`/`MIMIKIT_MANAGER_MODEL` 覆盖）
  - `prompt.maxTokens`：manager prompt token 上限（`MIMIKIT_MANAGER_PROMPT_MAX_TOKENS` 覆盖）
  - `taskCreate.debounceMs`：`create_task` 去抖窗口（`MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS` 覆盖）
  - `taskWindow.{minCount,maxCount,maxBytes}`：manager 每轮注入任务窗口
- `worker`
  - `maxConcurrent`：并发 worker 上限
  - `retry.{maxAttempts,backoffMs}`：worker 重试策略
  - `timeoutMs`：worker 超时
  - `model`：worker 默认模型（`MIMIKIT_WORKER_MODEL` 覆盖）
  - `modelReasoningEffort`：worker 推理强度（`MIMIKIT_REASONING_EFFORT`/`MIMIKIT_WORKER_REASONING_EFFORT` 覆盖）

## 状态目录

默认目录：`./.mimikit/`

- `history/YYYY-MM-DD.jsonl`
- `log.jsonl`
- `runtime-snapshot.json`
- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `tasks/tasks.jsonl`
- `task-progress/{taskId}.jsonl`
- `tasks/YYYY-MM-DD/*.md`
- `traces/YYYY-MM-DD/<ts36><ra>.txt`（`ts36`=9 位毫秒时间戳 base36；`ra`=`m|w` + `p|f|n`）
- `user_profile.md`
- `agent_persona.md`
- `agent_persona_versions/*.md`

## Manager 唤醒约束

- 唤醒来源四类：`user_input`、`task_result`、`cron`、`idle`
- 四类均为实时 signal（`notifyManagerLoop`）
- `idle` 由 `idle-wake-loop` 在持续闲暇窗口内按阈值触发（单次）
- manager 推理输入来自 `inputs/results/history`，并遵循可见性过滤：全部非 system 消息 + `visibility=agent|all` 的 system 消息。
- 若存在 `managerCompressedContext`，会通过 `M:compressed_context` 注入 manager prompt，作为跨 thread 压缩记忆。

## Prompt 环境注入

- 位置：`M:environment`（manager/worker 系统提示）
- 字段：
  - `work_dir`：当前工作目录绝对路径
  - `client_time_zone`：客户端时区（若可用）
  - `client_now_iso`：客户端当前时间 ISO 8601（若可用）
- 约束：不再注入 `now_iso`

## Runtime Snapshot 约束

- schema：`src/storage/runtime-snapshot-schema.ts`
- `runtime-snapshot.queues` 仅包含：
  - `inputsCursor`
  - `resultsCursor`
- `managerTurn`：manager 会话轮次计数
- `managerCompressedContext`：`compress_context` 生成的跨轮摘要
- 旧 grouped channel 结构不再兼容解析。

## Restart 语义

- `POST /api/restart` 与 `POST /api/reset` 均为“先响应请求，再异步停机”。
- 停机阶段会等待 in-flight manager 批次结束，再持久化 snapshot 并退出。
- WebUI 重启判定优先使用 `/api/status.runtimeId` 变更，避免旧实例短暂存活导致误判刷新。

# 接口与状态目录（当前实现）
> 返回 [系统设计总览](../README.md)

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

实现：`src/http/index.ts`、`src/http/routes-api.ts`、`src/http/routes-api-sections.ts`

HTTP 路由共享约束：
- ETag 逻辑统一在 `src/http/etag.ts`（`/api/status`、`/api/messages` 同源行为）。
- `POST /api/input` 的 body 校验统一在 `src/http/helpers.ts`（zod `safeParse`）。
- `messages/tasks` 的 `limit` 归一化统一在 `src/http/helpers.ts`（容错回退默认值）。
- `GET /api/messages` 返回：全部非 system 消息 + `visibility=user|all` 的 system 消息。
- 对 `role=system` 消息，WebUI 展示层会去除隐藏的 `<M:...>` 标签，仅显示语义文本。
- `:id` 参数校验与任务存在性校验统一在 `src/http/routes-api-sections.ts` 内部 helper。

`GET /api/status` 响应关键字段：
- `runtimeId`：当前进程实例标识；每次进程重启都会变化，可用于前端判定“是否已切换到新实例”。
- `agentStatus` / `managerRunning` / `pendingInputs`：用于 WebUI 运行态与恢复态渲染。

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

## 配置结构（`config/default.yaml`）
- `manager`
  - `model`：manager 默认模型（`MIMIKIT_MODEL`/`MIMIKIT_MANAGER_MODEL` 覆盖）
  - `prompt.maxTokens`：manager prompt token 上限（`MIMIKIT_MANAGER_PROMPT_MAX_TOKENS` 覆盖）
  - `taskCreate.debounceMs`：`create_task` 去抖窗口（`MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS` 覆盖）
  - `taskWindow.{minCount,maxCount,maxBytes}`：manager 每轮注入任务窗口
  - `session.compressTimeoutMs`：`compress_context` 会话压缩超时
- `worker`
  - `maxConcurrent`：并发 worker 上限
  - `retry.{maxAttempts,backoffMs}`：worker 重试策略
  - `profiles.standard.{timeoutMs,model}`（`MIMIKIT_WORKER_STANDARD_MODEL` 覆盖模型）
  - `profiles.specialist.{timeoutMs,model,modelReasoningEffort}`（`MIMIKIT_WORKER_SPECIALIST_MODEL` 与 `MIMIKIT_WORKER_SPECIALIST_REASONING_EFFORT` 覆盖）

配置约束：
- 不保留旧键兼容层；`deferred.*`、`worker.retryMaxAttempts`、`worker.retryBackoffMs`、`worker.standard`、`worker.specialist` 均为历史路径。

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

状态写入共享约束：
- JSONL 串行写锁：`src/storage/serialized-lock.ts`（进程内串行 + `proper-lockfile` 文件锁）。
- JSONL 读取：`src/storage/jsonl.ts` 使用 `stream-json` 流式解析。
- 按日期归档写入：`src/storage/archive-write.ts`（`tasks` 与 `traces` 复用）。
- 归档元数据：`src/storage/archive-format.ts` 使用 front matter（`gray-matter`）。

## Manager 唤醒约束
- 唤醒来源四类：`user_input`、`task_result`、`cron`、`idle`
- 四类均为实时 signal（`notifyManagerLoop`）
- `idle` 由 `idle-wake-loop` 在持续闲暇窗口内按阈值触发（单次）
- manager 推理输入来自 `inputs/results/history`，并遵循可见性过滤：全部非 system 消息 + `visibility=agent|all` 的 system 消息。

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
- 主会话恢复字段：
  - `plannerSessionId`
- 旧 grouped channel 结构不再兼容解析。

## Restart 语义
- `POST /api/restart` 与 `POST /api/reset` 均为“先响应请求，再异步停机”。
- 停机阶段会等待 in-flight manager 批次结束，再持久化 snapshot 并退出。
- WebUI 重启判定优先使用 `/api/status.runtimeId` 变更，避免旧实例短暂存活导致的误判刷新。

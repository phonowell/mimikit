# 接口与状态目录（当前实现）

> 返回 [系统设计总览](../README.md)

## HTTP API（`src/http/*`）

- `GET /api/events`
- `GET /api/status`
- `POST /api/input`
- `POST /api/qq/events`（启用 `qq.enabled=true` 时注册）
- `DELETE /api/messages/:id`
- `GET /api/tasks/:id/archive`
- `POST /api/tasks/:id/cancel`
- `POST /api/choices/:id/select`
- `POST /api/restart`
- `POST /api/reset`
- `POST /api/reset-with-summary`

## 静态路由（WebUI 文件访问）

- `GET /state-files/*`（映射 `.mimikit/*`）

说明：
- `state-files` 用于 WebUI 直接打开工作目录（`.mimikit`）内证据文件与生成物。

## SSE 事件模型（`GET /api/events`）

- `snapshot`：全量快照，包含 `status/messages/tasks/plans/focuses/choice`。
- `tasks`：任务列表快照更新（由 worker 侧状态变化触发）。
- `heartbeat`：SSE 保活心跳。
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
- `QQ_CHANNEL_ENABLED`
- `QQ_APP_ID`
- `QQ_CLIENT_SECRET`
- `QQ_API_BASE`
- `QQ_CALLBACK_PATH`

## 配置结构（`config.yaml`）

- 若缺少 `config.yaml`，启动阶段会由 `defaults/config.template.yaml` 自动生成。
- `manager.model`
- `manager.provider.{baseUrl,apiKey}`（可选，仅 manager）
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
- `qq.enabled`
- `qq.appId`
- `qq.appSecret`
- `qq.apiBase`
- `qq.callbackPath`
- `qq.verifySign`
- `qq.clockSkewMs`

## QQ 模块边界（`src/channels/qq/*`）

- `config.ts`：QQ 配置 schema、环境变量覆写、启用态配置校验
- `http-webhook.ts`：QQ webhook 入站与验签/ACK/C2C 入队
- `signature.ts`：QQ 回调签名验签与 challenge 签名
- `client.ts`：QQ OpenAPI token 获取与被动文本发送
- `state.ts` + `state-schema.ts`：QQ 事件去重与 `msg_seq` 持久化
- `passive-reply.ts`：manager 回复后的 QQ 被动发送守卫（60 分钟 + 5 条上限）
- `index.ts`：对核心层暴露统一集成入口

## 状态目录（默认 `./.mimikit/`）

- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `tasks/tasks.jsonl`
- `task-progress/{taskId}.jsonl`
- `tasks/YYYY-MM-DD/*.md`
- `traces/YYYY-MM-DD/<ts36><ra>.txt`
- `history/YYYY-MM-DD.jsonl`
- `memory/MEMORY.md`
- `*`（由 `/state-files/*` 静态路由暴露）
- `qq/event-state.json`
- `runtime-snapshot.json`
- `runtime-snapshot.json.bak`
- `log.jsonl`

说明：
- manager 每轮会直接注入 `M:memory`
- `memory/MEMORY.md` 由后台 memory 刷新子进程维护（`>=20` 轮触发，单飞执行）

## WebUI 路径链接规则

- 纯文本本地路径在渲染前会自动 linkify（仅消息 Markdown 区域）。
- `.mimikit` 内路径统一映射到 `GET /state-files/*`。
- 保护规则：行内代码、代码块、已存在的 Markdown 链接目标不会被二次改写。

## Runtime Snapshot 关键字段

schema：`src/storage/runtime-snapshot-schema.ts`

- `tasks`
- `taskPlans`
- `focuses`、`focusContexts`、`activeFocusIds`
- `managerTurn`、`managerFocusCompressedContexts`
- `memoryRefresh`（刷新检查点）
- `queues.inputsCursor`、`queues.resultsCursor`
- `pendingUserChoice`

恢复一致性规则（启动阶段）：
- 若 `queues.inputsCursor` 大于 `inputs/packets.jsonl` 当前包数，重置为 `0`
- 若 `queues.resultsCursor` 大于 `results/packets.jsonl` 当前包数，重置为 `0`
- 若 `memoryRefresh.lastProcessedInputsCursor` / `lastProcessedResultsCursor` 超过对应队列包数，同步重置为 `0`
- 发生校正时写入 `log.jsonl` 事件：`runtime_queue_state_reconciled`

## 重启语义

- `POST /api/restart`、`POST /api/reset`、`POST /api/reset-with-summary` 仅在运行时空闲（manager 未运行且无 pending/running task）时可执行；忙时返回 `409`。
- 空闲时上述接口均为“先回包，再异步停机”。
- 停机阶段会等待 in-flight manager 批次收敛，再持久化 snapshot 并退出。
- `reset` 会在持久化后清空状态目录并重建。
- `reset-with-summary` 会先将最近会话生成重启摘要并落盘，再执行与 `reset` 相同的清理流程。

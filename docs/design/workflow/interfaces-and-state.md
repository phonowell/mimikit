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

## 静态路由（WebUI 文件访问）

- `GET /state-files/*`（映射 `workDir/*`，默认 `./.mimikit/*`）

说明：
- `state-files` 用于 WebUI 直接打开当前 `workDir` 内证据文件与生成物。

## SSE 事件模型（`GET /api/events`）

- `snapshot`：全量快照，包含 `status/messages/tasks/plans/focuses/choice`。
- `tasks`：任务列表快照更新（由 worker 侧状态变化触发）。
- `heartbeat`：SSE 保活心跳。
- `error`：SSE 连接内错误反馈。

说明：当前实现通过 SSE 下发消息、任务、plans 与 focus，不提供独立 `messages/tasks/plans` HTTP 查询接口。

补充：
- `tasks.tasks[*].liveOutput` 为运行中任务的流式输出片段（仅 WebUI 展示，运行态内存数据，不承诺持久化）。
- WebUI 消息入口为 `webui/messages/controller-payload.js#applyMessagesPayload`；该入口会对进入会话流的消息输出控制台日志（`role/type/source/visibility/summary`），并按消息签名去重以避免重复刷屏。

## System 气泡可见性规则（WebUI 会话流）

- 判定入口：`src/shared/system-message-visibility.ts`（由 `src/shared/message-visibility.ts#isVisibleToUser` 调用）。
- 直接对用户有价值的 system 事件默认可见：`startup`、`task_created`、`task_canceled`、`task_completed`、`manager_fallback_reply`、`user_choice`、`user_choice_skipped`。
- 内部编排/调度/控制类事件默认不可见：`manager_round_limit`、`manager_error`、`action_feedback`、`trigger_fire`、`worker_slots_idle`、`worker_slot_freed`、`plan_created`、`plan_updated`、`plan_deleted`。
- 未识别 system_event 采用保守策略：`visibility=user` 保持可见，`visibility=all` 默认不展示给最终用户。

`manager_fallback_reply` 失败重试补充（网络波动场景）：
- 后端在 `manager_fallback_reply` payload 追加 `source_input_id` 与自动重试元数据：`auto_retry_attempts`、`auto_retry_max_attempts`、`auto_retry_state`、`auto_retry_strategy`。
- WebUI 在消息模型中保留 `systemEventName/systemEventPayload`，不依赖文案关键词判断事件类型。
- 当 `auto_retry_state` 为 `exhausted/not_retryable` 时，WebUI 在该 system 气泡展示 `Retry` 按钮；点击后复用原发送入口重新提交 `source_input_id` 对应用户输入。

## 输入协议（`POST /api/input`）

请求体（`parseInputBody`）：

- 必填：`text`
- 可选：`quote`、`language`
- 可选客户端上下文：`clientLocale`、`clientTimeZone`、`clientOffsetMinutes`、`clientNowIso`

## 取消任务协议（`POST /api/tasks/:id/cancel`）

- 成功：`{ ok: true, id, status: "canceled", changeAt }`
- 失败：`{ ok: false, id, status, changeAt?, error }`
- 说明：`id` 固定为目标任务 ID；`status` 取值 `not_found | invalid | already_canceled | already_done`；`changeAt` 与任务视图字段语义一致。

## CLI 入口

- `pnpm start`
- `tsx src/cli/index.ts --port 8787 --work-dir .mimikit`

## 环境变量（`src/cli/env.ts`）

- `MIMIKIT_MODEL`
- `MIMIKIT_MANAGER_MODEL`
- `MIMIKIT_WORKER_MODEL`
- `MIMIKIT_REASONING_EFFORT`
- `MIMIKIT_MANAGER_REASONING_EFFORT`
- `MIMIKIT_WORKER_REASONING_EFFORT`
- `TELEGRAM_CHANNEL_ENABLED`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_API_ROOT`

## 配置结构（`config.yaml`）

- 若缺少 `config.yaml`，启动阶段会由 `defaults/config.template.yaml` 自动生成。
- `manager.model`
- `manager.modelReasoningEffort`
- `manager.provider.{baseUrl,apiKey}`（可选，仅 manager）
- `worker.maxConcurrent`
- `worker.timeoutMs`
- `worker.model`
- `worker.modelReasoningEffort`
- `telegram.enabled`
- `telegram.botToken`
- `telegram.chatId`
- `telegram.apiRoot`

## Telegram 模块边界（`src/channels/telegram/*`）

- `config.ts`：Telegram 配置 schema、环境变量覆写、启用态配置校验
- `polling.ts`：Telegram long polling 入站与生命周期管理
- `client.ts`：Telegram `sendMessage` 文本发送
- `passive-reply.ts`：manager 回复后的 Telegram 被动发送
- `index.ts`：对核心层暴露统一集成入口

## 状态目录（默认 `./.mimikit/`）

- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `tasks/tasks.jsonl`
- `task-progress/YYYY-MM-DD/{taskId}.jsonl`
- `tasks/YYYY-MM-DD/*.md`
- `traces/YYYY-MM-DD/<ts36><ra>.txt`
- `history/YYYY-MM-DD.jsonl`
- `memory/MEMORY.md`
- `*`（由 `/state-files/*` 静态路由暴露）
- `runtime-snapshot.json`
- `runtime-snapshot.json.bak`
- `log.jsonl`
- `.instance`（运行时实例锁文件）

说明：
- manager 每轮会直接注入 `M:memory`
- `memory/MEMORY.md` 由两条链路维护：后台 memory 刷新子进程（`>=20` 轮触发，单飞执行）+ manager `remember_memory` 即时写入

## WebUI 路径链接规则

- 纯文本本地路径在渲染前会自动 linkify（仅消息 Markdown 区域）。
- `workDir` 内路径统一映射到 `GET /state-files/*`（默认是 `.mimikit`）。
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

- `POST /api/restart`、`POST /api/reset` 仅在控制面可执行窗口（manager 未运行且无 pending/running task）时可执行；忙时返回 `409`。
- 满足控制窗口时上述接口均为“先回包，再异步停机”。
- 停机阶段会等待 in-flight manager 批次收敛，再持久化 snapshot 并退出。
- `reset` 会在持久化后清空状态目录并重建。

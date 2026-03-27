# 接口与状态目录（当前实现）

> 返回 [系统设计总览](../README.md)

## 文档边界

- 本文档仅定义 HTTP/SSE/CLI/配置与状态目录等接口事实。
- Task/Action/Plan/Focus/Memory 的生命周期与执行语义不在本文定义，统一以 `./task.md`、`./action.md`、`./plan.md`、`./focus.md`、`./memory.md` 为准。

## HTTP API（`src/surface/http/*`）

- `GET /api/events`
- `GET /api/status`
- `POST /api/input`
- `DELETE /api/messages/:id`
- `GET /api/tasks/:id/archive`
- `POST /api/tasks/:id/pause`
- `POST /api/tasks/:id/resume`
- `POST /api/tasks/:id/cancel`
- `POST /api/tasks/:id/delete`
- `POST /api/restart`
- `POST /api/reset`

`GET /api/status` 当前除基础运行状态外，还会返回：

- `managerLastUsage`
- `managerUsageTotal`
- `workerUsageTotal`

任务变更接口（pause/resume/cancel/delete）统一返回：

- 成功：`{ ok: true, id, status, changeAt? }`
- 失败：`{ ok: false, id, status, changeAt?, error }`

任务变更失败状态码映射：

- `status=not_found` -> `404`
- `status=invalid` -> `400`
- `status=active_task` -> `409`
- 其他业务拒绝（如 `already_done/already_paused/not_paused/already_canceled`）-> `409`

## 静态路由（WebUI 文件访问）

- `GET /state-files/*`（映射 `workDir/*`，默认 `./.mimikit/*`）
- `GET /`（WebUI 静态资源）

说明：

- `state-files` 用于 WebUI 直接打开当前 `workDir` 内证据文件与生成物。
- 访问 `/state-files/**/tasks/*.md`（且无 `raw=1`）会 302 跳转到 `/archive-viewer.html?src=...`。

## SSE 事件模型（`GET /api/events`）

- `snapshot`：快照事件，包含 `status/messages/tasks/plans/focuses`。
- `tasks`：任务列表快照更新（由 worker 侧状态变化触发），载荷为任务视图快照对象。
- `heartbeat`：SSE 保活心跳。
- `error`：SSE 连接内错误反馈。
- 心跳周期：`15s`（`SSE_HEARTBEAT_MS=15000`）。

消息快照模式：

- `messages.mode=full`：完整消息列表。
- `messages.mode=delta`：相对上次游标增量。
- `messages.mode=reset`：游标失效后重置为完整列表。

补充：

- `tasks.tasks[*].liveOutput` 为运行中任务的流式输出片段（仅 WebUI 展示，运行态内存数据，不承诺持久化）。
- `tasks.tasks[*].title` 只使用稳定 `Task.title`；若标题缺失则退回 `task.id`，不再从 `task.prompt` 派生展示标题。
- `tasks.tasks[*]` 会暴露 `stopReason`；当前不再产出预算暂停态或额外的 recoverable UI 标记。
- `tasks.tasks[*].traceRef` 会在 task result 已归档 trace 时暴露 `.mimikit/traces/...` 相对路径，供 WebUI 直接跳转。

## System 气泡可见性规则（WebUI 会话流）

- 判定入口：`src/surface/shared/system-message-visibility.ts`（由 `src/surface/shared/message-visibility.ts` 调用）。
- 直接对用户有价值的 system 事件默认可见：`startup`、`task_created`、`task_paused`、`task_resumed`、`task_canceled`、`task_completed`、`manager_fallback_reply`。
- 内部编排/调度/控制类事件默认不可见：`manager_round_limit`、`manager_error`、`trigger_fire`、`worker_slot_freed`、`plan_created`、`plan_updated`、`plan_deleted`。
- 未识别 system_event 采用保守策略：`visibility=user` 保持可见，`visibility=all` 默认不展示给最终用户。
- system 消息落盘/出站采用双轨字段：`text` 仅承载用户可读摘要，`systemEventName/systemEventPayload` 承载结构化事件元数据；WebUI/manager/log 不再从 `text` 反解析协议标签。

`manager_fallback_reply` 事件补充：

- payload 可能包含 `source_input_id`、`auto_retry_attempts`、`auto_retry_max_attempts`、`auto_retry_state`、`auto_retry_strategy`。
- WebUI 通过 `systemEventName/systemEventPayload` 识别事件，不依赖文案关键词。
- `startup` payload 包含 `runtime_id`、`started_at`，并在可用时附带 `commit`、`dirty`、`worktree`。

## 输入协议（`POST /api/input`）

请求体（`parseInputBody`）：

- 必填：`text`
- 可选：`quote`、`language`
- 可选客户端上下文：`clientLocale`、`clientTimeZone`、`clientOffsetMinutes`、`clientNowIso`
- 限制：当前仅支持纯文本输入，不支持图片/附件直传。

请求体错误语义：

- 缺少或空 `text` -> `400 { error: "text is required" }`
- 非法 JSON 或 schema 不匹配 -> `400 { error: "invalid JSON" }`

## 消息删除协议

- `DELETE /api/messages/:id`
- 仅允许删除非 system 消息
- system 消息删除请求返回 `400 { error: "system message cannot be deleted" }`
- 消息不存在返回 `404 { error: "message not found" }`

## CLI 入口

- `pnpm start`
- `tsx src/bootstrap/cli/index.ts --work-dir .mimikit`
- `tsx src/bootstrap/cli/index.ts --port 8787 --work-dir .mimikit`

## 环境变量（`src/bootstrap/cli/env.ts`）

- 模型：`MIMIKIT_MODEL`、`MIMIKIT_MANAGER_MODEL`、`MIMIKIT_CODEX_MODEL`
- 推理强度：`MIMIKIT_REASONING_EFFORT`、`MIMIKIT_MANAGER_REASONING_EFFORT`、`MIMIKIT_CODEX_REASONING_EFFORT`
- 代理：`MIMIKIT_PROXY`、`MIMIKIT_MANAGER_PROXY`、`MIMIKIT_CODEX_PROXY`
- provider 开关：`MIMIKIT_CODEX_ENABLED`
- CLI action 日志：`MIMIKIT_ACTION_LOGS`
- WebUI：`MIMIKIT_WEBUI_ENABLED`、`MIMIKIT_WEBUI_PORT`
- Telegram：`TELEGRAM_CHANNEL_ENABLED`、`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`、`TELEGRAM_API_ROOT`、`TELEGRAM_PROXY`

## 配置结构（`config.toml`）

- 若缺少 `config.toml`，请先运行 `pnpm run bootstrap` 从 `defaults/config.template.toml` 生成。
- `manager`: `model`、`modelReasoningEffort`、`baseUrl?`、`apiKey?`、`proxy?`、`maxCorrectionRounds`
- `worker`: `maxConcurrent`、`timeoutMs`
- `codex`: `enabled`、`model`、`modelReasoningEffort`、`capability`、`billing`、`proxy?`
- `webui`: `enabled`、`port`
- `telegram`: `enabled`、`botToken`、`chatId`、`apiRoot`、`proxy`

## 状态目录（默认 `./.mimikit/`）

- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `tasks/tasks.jsonl`（任务视图快照，保留最近 100 条）
- `task-progress/YYYY-MM-DD/{taskId}.jsonl`
- `tasks/YYYY-MM-DD/*.md`（任务归档）
- `traces/YYYY-MM-DD/<ts36><ra>.txt`
- `history/YYYY-MM-DD.jsonl`
- `memory/MEMORY.md`
- `generated/worker-task-prompts/YYYY-MM-DD/{taskId}.md`
- `usage/ledger.jsonl`
- `runtime-snapshot.json`
- `runtime-snapshot.json.bak`
- `log.jsonl`
- `.instance.lock`（运行时实例锁目录）
- `runtime/lease.json`（主进程 lease 心跳）
- `runtime/children.json`（外部 worker 子进程注册表）
- `runtime/reaper.json`（reaper 守护进程标记）

说明：

- `memory/MEMORY.md` 由两条链路维护：后台 memory 刷新子进程（`>=20` 轮且 `signalVersion != lastProcessedSignalVersion` 时触发，单飞执行）+ manager `remember_memory` 即时写入。
- `usage/ledger.jsonl` 追加写入 manager round 与 worker result 两类账本记录；manager 记录 `wakeProfile/packetMode/promptBytes/promptSegmentCount`，worker 记录 `taskId/provider/status/usage`。
- worker task archive frontmatter 当前会额外写入 `trace_path`，用于从 archive 稳定反链回对应 trace 文件。
- `log.jsonl` 中 manager 每轮会写 `manager_context_budget_resolved`，显式记录 `policy=fixed`、`wakeProfile` 与最终 `promptSectionLimits`；预算解释以这条日志为准，不再依赖隐式分档推导。每次启动还会先写入 `runtime_startup` 事件，至少包含 `runtimeId`、`startedAt`、`worktree`，并在可用时附带 `commit`、`dirty`。
- 异常退出（如被 kill）时，reaper 依据 `runtime/lease.json + runtime/children.json` 回收残留子进程。

## Runtime Snapshot 关键字段

schema：`src/persistence/storage/runtime-snapshot-schema.ts`

- `tasks`（含 `tasks[*].provider`、可选 `tasks[*].git={ worktreePath, branch }`）
- `tasks[*].result.traceRef?`
- `taskPlans`
- `focuses`
- `managerTurn`
- `managerThreadId`
- `queues.inputsCursor`、`queues.resultsCursor`
- `memoryRefresh`

补充：

- `channelTargets`、`managerLastUsage`、`managerUsageTotal` 都是进程内交互/观测态，不进入 snapshot。
- `channelTargets` 启动时会从最近 history 用户消息中的 chat id 恢复。
- `runtime-snapshot` 运行期只接受当前 `schemaVersion`；旧版本/旧字段会被直接拒绝，不再提供仓内迁移脚本。
- `workerUsageTotal` 不持久化到 snapshot；`GET /api/status` 会在返回时按 `tasks[*].result.usage ?? tasks[*].usage` 实时聚合。
- `taskPlans[*]` 当前使用 `trigger + effect` 结构，不再持久化顶层 `prompt/profile/source` 旧字段。

恢复一致性规则（启动阶段）：

- 若 `queues.inputsCursor` 大于 `inputs/packets.jsonl` 当前包数，重置为 `0`
- 若 `queues.resultsCursor` 大于 `results/packets.jsonl` 当前包数，重置为 `0`
- 发生校正时写入 `log.jsonl` 事件：`runtime_queue_state_reconciled`

## 重启语义

- `POST /api/restart`、`POST /api/reset` 仅在控制面可执行窗口（manager 未运行且无 pending/running task）时可执行；忙时返回 `409`。
- 满足控制窗口时上述接口均为“先回包，再异步停机”。
- 停机阶段会等待 in-flight manager 批次收敛，再持久化 snapshot 并退出。
- `reset` 会在持久化后清空状态目录并重建。

## `/api/status` 字段

- `ok`
- `runtimeId`
- `agentStatus`（`idle|running`）
- `activeTasks`
- `pendingTasks`
- `pendingInputs`
- `managerRunning`
- `maxWorkers`
- `managerLastUsage?`
- `managerUsageTotal?`
- `workerUsageTotal?`

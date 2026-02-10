# 任务与 Action（当前实现）

> 返回 [系统设计总览](./README.md)

## 任务生命周期
- `pending`：manager 已派发，等待执行。
- `running`：worker 执行中。
- `succeeded | failed | canceled`：终态。

## 派发与去重
- manager 通过 `@create_task` 派发任务。
- `profile`：`standard | specialist`。
- 去重两层：
  - action 去重键：`prompt + title + profile`
  - queue 去重键：`task.fingerprint`（仅拦 active 任务）

## 执行与回写
1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 执行并收敛错误。
3. `finalizeResult` 更新任务状态并归档。
4. 结果发布到 `results`，由 manager 消费。

## 取消与恢复
- `pending` 取消：立即标记并发布 `canceled`。
- `running` 取消：触发 `AbortController`，由执行链路收敛到 `canceled`。
- 启动恢复：`hydrateRuntimeState` 恢复 pending/running；持久化时 running 降级为 pending，重启后重入队列。

## Action 协议
协议与解析：`src/actions/protocol/*`

- Action 块：`<MIMIKIT:actions> ... </MIMIKIT:actions>`
- 每行一条：`@name key="value"`
- 参数在传输层统一字符串，执行前做 schema 校验。

Action 名称集合（`src/actions/model/names.ts`）：
- 文件类：`read_file` `search_files` `write_file` `edit_file` `patch_file`
- 进程类：`exec_shell` `run_browser`
- 编排类：`create_task` `cancel_task` `summarize_task_result`

## 可执行 Action（registry）
实现：`src/actions/defs/*` + `src/actions/registry/index.ts`

- 已注册：`read_file` `search_files` `write_file` `edit_file` `patch_file` `exec_shell` `run_browser`
- `invokeAction()`：查 spec → 参数校验 → 执行 → `safeRun` 包装异常
- 未注册 action 返回：`unknown_action:{name}`

## Manager 消费的编排 Action
实现：`src/manager/action-apply.ts`

### `create_task`
- 入参：`prompt`、`title`、`profile`
- 约束：`profile ∈ {standard, specialist}`
- 去重：`prompt + title + profile`

### `cancel_task`
- 入参：`task_id`
- 行为：`cancelTask(..., { source: 'manager' })`

### `summarize_task_result`
- 入参：`task_id`、`summary`
- 行为：汇总为 `Map<taskId, summary>`，用于结果写入 `history` 时压缩输出。

## Worker Standard 结束规则
来源：`src/worker/standard-step.ts`

- 未完成：输出一条可执行 action。
- 已完成：输出纯文本最终结果（不输出 action 块）。

## 核心数据结构
定义：`src/types/index.ts`

### UserInput
- 字段：`id`、`text`、`createdAt`、`quote?`
- 写入：`inputs/packets.jsonl`

### Task
- 字段：`id`、`fingerprint`、`prompt`、`title`、`profile`、`status`
- 运行字段：`startedAt?`、`completedAt?`、`durationMs?`、`attempts?`
- `profile`：`standard | specialist`

### TaskResult
- 字段：`taskId`、`status`、`ok`、`output`、`durationMs`、`completedAt`
- 可选：`usage`、`title`、`archivePath`、`profile`
- 写入：`results/packets.jsonl`

### HistoryMessage
- 字段：`id`、`role(user|assistant|system)`、`text`、`createdAt`
- 可选：`usage`、`elapsedMs`、`quote`
- 写入：`history.jsonl`

### Queue Packet
- 结构：`{ id, createdAt, payload }`
- `inputs/results` 使用统一 packet 包装。


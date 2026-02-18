# 任务与 Action（当前实现）

> 返回 [系统设计总览](./README.md)

## 任务生命周期

- `pending`：manager 已派发，等待执行。
- `running`：worker 执行中。
- `succeeded | failed | canceled`：终态。

## 派发与去重

- manager 通过 `<M:create_task ... />` 派发任务。
- `profile`：`deferred | standard | specialist`。
- 去重两层：
  - action 去重键：`prompt + title + profile`
  - queue 去重键：`task.fingerprint`（`prompt + title + profile + schedule`，仅拦 active 任务）

## 执行与回写

1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 执行并收敛错误。
3. `finalizeResult` 更新任务状态并归档。
4. 常规终态：发布到 `results`，并立即唤醒 manager 消费结果。
5. `pending` 快速取消：发布 `canceled` 到 `results`，并立即唤醒 manager。

## 取消与恢复

- `pending` 取消：立即标记并发布 `canceled`，随后立即唤醒 manager。
- `running` 取消：触发 `AbortController`，由执行链路收敛到 `canceled`。
- 启动恢复：`hydrateRuntimeState` 恢复全部任务状态；持久化时 `running` 降级为 `pending`，重启后重入队列，其余状态原样恢复用于历史展示。

## Action 协议

协议与解析：`src/actions/protocol/*`

- Action 块：`<M:actions> ... </M:actions>`
- 每行一条：`<M:name key="value" />`
- 参数在传输层统一字符串，由 manager 侧 schema 校验后再执行编排动作。

## Manager 消费的编排 Action

实现：`src/manager/action-apply.ts`、`src/manager/loop-batch-run-manager.ts`、`src/manager/history-query.ts`

### `query_history`

- 入参：`query`、`limit?`、`roles?`、`before_id?`、`from?`、`to?`
- 行为：触发历史检索并进入下一轮 manager 推理；`from/to` 为 ISO 8601 时间范围（含端点，顺序可颠倒）。
- 实现：`flexsearch` + 新近度加权（不再保留 BM25 回退分支）。

### `create_task`

- 入参：`prompt`、`title`、`profile`
- 约束：`profile ∈ {deferred, standard, specialist}`
- 去重：`prompt + title + profile`

### `cancel_task`

- 入参：`id`
- 行为：`cancelTask(..., { source: 'deferred' })`

### `summarize_task_result`

- 入参：`task_id`、`summary`
- 行为：汇总为 `Map<taskId, summary>`，用于结果写入 `history` 时压缩输出。

## Worker 输出规则

来源：`src/worker/profiled-runner.ts`

- `standard/specialist` 都执行单次 provider 调用并直接返回原始输出，不要求固定 JSON 格式。
- 两者执行逻辑一致，唯一差异是 provider：`standard=opencode`、`specialist=codex-sdk`。

## 核心数据结构

定义：`src/types/index.ts`

### UserInput

- 字段：`id`、`text`、`createdAt`、`quote?`
- 写入：`inputs/packets.jsonl`

### Task

- 字段：`id`、`fingerprint`、`prompt`、`title`、`profile`、`status`
- 运行字段：`startedAt?`、`completedAt?`、`durationMs?`、`attempts?`
- `profile`：`deferred | standard | specialist`

### TaskResult

- 字段：`taskId`、`status`、`ok`、`output`、`durationMs`、`completedAt`
- 可选：`usage`、`title`、`archivePath`、`profile`
- 写入：`results/packets.jsonl`

### HistoryMessage

- 字段：`id`、`role(user|assistant|system)`、`text`、`createdAt`
- 可选：`usage`、`elapsedMs`、`quote`
- 写入：`history/YYYY-MM-DD.jsonl`

### Queue Packet

- 结构：`{ id, createdAt, payload }`
- `inputs/results` 使用统一 packet 包装。

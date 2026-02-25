# 任务与 Action（当前实现）

> 返回 [系统设计总览](../README.md)

## 任务生命周期

- `pending`：manager 已派发，等待执行。
- `running`：worker 执行中。
- `succeeded | failed | canceled`：终态。

## 派发与去重

- manager 通过 `<M:create_task ... />` 派发任务。
- worker 任务 profile 固定为 `worker`。
- 去重两层：
  - action 去重键：`prompt + title + profile(worker)`
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

- Action 行格式：`<M:name key="value" />`
- 解析链路（无正则主解析）：
  - `micromark` 先标注 Markdown 代码块范围（忽略 fenced/indented code 内的伪 action）。
  - `htmlparser2` 负责扫描标签起点，动作标签范围由状态机按字符流收敛。
  - 属性值由独立属性解析器处理，支持 `\"`、`\'` 等转义并保留换行。
- 输出清洗规则：
  - 仅解析末尾连续 action 区（尾部除空白外无其他内容）。
  - 可见文本会剥离非代码块中的 `M:` 标签，避免 WebUI 渲染残留协议标签。
- 参数在传输层统一字符串，由 manager 侧 schema 校验后再执行编排动作。

## Manager 消费的编排 Action

实现：`src/manager/action-apply.ts`、`src/manager/loop-batch-run-manager.ts`、`src/manager/history-query.ts`

当 manager 输出未注册 action、action 参数不合法、或可判定的执行失败（如 `cancel_task` 目标不存在）时，系统会在下一次同批次重试中注入 `system_event.name=action_feedback`，显式告知错误并要求修正后重试。

### `query_history`

- 入参：`query`、`limit?`、`roles?`、`before_id?`、`from?`、`to?`
- 行为：触发历史检索并进入下一轮 manager 推理；`from/to` 为 ISO 8601 时间范围（含端点，顺序可颠倒）。
- 实现：`flexsearch` + 新近度加权（不再保留 BM25 回退分支）。

### `create_task`

- 入参：`prompt`、`title`、`cron?`、`scheduled_at?`
- 约束：
  - `cron` 与 `scheduled_at` 互斥
  - 不允许传 `profile`
- 去重：`prompt + title + profile(worker)`

### `cancel_task`

- 入参：`id`
- 行为：`cancelTask(..., { source: 'deferred' })`

### `compress_context`

- 入参：无（严格空对象）
- 行为：
  1. 基于本地 `history + tasks + managerCompressedContext` 组装压缩上下文
  2. 调用 manager provider 产出结构化摘要
  3. 将摘要写入 runtime `managerCompressedContext`
- 约束：无可压缩上下文时拒绝执行并返回 `action_feedback`

### `summarize_task_result`

- 入参：`task_id`、`summary`
- 行为：汇总为 `Map<taskId, summary>`，用于结果写入 `history` 时压缩输出。

## Worker 输出规则

来源：`src/worker/profiled-runner.ts`

- worker 执行 Codex provider 调用并返回原始输出，不要求固定 JSON 格式。
- 多轮执行直到出现 `DONE` 标记或到达上限轮次。

## 核心数据结构

定义：`src/types/index.ts`

### UserInput

- `role=user`：字段为 `id`、`role`、`text`、`createdAt`、`quote?`（不含 `visibility`）。
- `role=system`：字段为 `id`、`role`、`visibility(user|agent|all)`、`text`、`createdAt`、`quote?`。
- 写入：`inputs/packets.jsonl`

### Task

- 字段：`id`、`fingerprint`、`prompt`、`title`、`profile`、`status`
- 运行字段：`startedAt?`、`completedAt?`、`durationMs?`、`attempts?`
- `profile`：`worker`

### TaskResult

- 字段：`taskId`、`status`、`ok`、`output`、`durationMs`、`completedAt`
- 可选：`usage`、`title`、`archivePath`、`profile`
- usage 字段：
  - `input/output/total`：单轮 token
  - `sessionTotal`：会话累计（可缺省）
  - `inputCacheRead/inputCacheWrite`：输入缓存读/写 token
  - `outputCache`：输出缓存 token（provider 支持时）
- 写入：`results/packets.jsonl`

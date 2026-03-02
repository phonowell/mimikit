# 任务（Task）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- `pending`：manager 已派发，等待执行。
- `running`：worker 执行中。
- `succeeded | failed | canceled`：终态。

## 派发与去重

- 立即执行 Action：`<M:run_task ... />`
- worker 任务 profile 固定为 `worker`
- action 去重键：`prompt + title + profile + focusId`
- queue 去重键：`task.fingerprint`（仅拦 active 任务）

## 执行与回写

1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 执行并收敛错误。
3. `finalizeResult` 更新任务状态并归档。
4. 发布到 `results`，立即唤醒 manager 消费结果。
5. `pending` 快速取消：发布 `canceled` 到 `results`，立即唤醒 manager。

## 取消与恢复

- `pending` 取消：立即标记并发布 `canceled`。
- `running` 取消：触发 `AbortController`，由执行链路收敛到 `canceled`。
- 启动恢复：持久化时 `running` 降级为 `pending`，重启后重入队列。

## 关联数据结构

定义：`src/types/index.ts`

- `Task`

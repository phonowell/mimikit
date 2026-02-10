# 任务系统（当前实现）

> 返回 [系统设计总览](./README.md)

## 生命周期
- `pending`：manager 已派发，等待执行
- `running`：worker 执行中
- `succeeded | failed | canceled`：终态

## 派发与去重
- manager 通过 `@create_task` 派发任务。
- profile：`standard | specialist`。
- 去重分两层：
  - action 去重键：`prompt + title + profile`
  - queue 去重键：`task.fingerprint`（仅拦 active 任务）

## 执行与回写
1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 执行并收敛错误。
3. `finalizeResult` 更新任务状态并归档。
4. 结果发布到 `results`，由 manager 消费。

## 取消规则
- `pending`：立即标记并发布 `canceled`。
- `running`：触发 `AbortController`，由执行链路收敛到 `canceled`。

## 启动恢复
- `hydrateRuntimeState` 恢复 pending/running 任务。
- 持久化时 running 会降级为 pending，重启后重入队列。

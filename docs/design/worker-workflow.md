# Worker 工作流程（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 调度：`src/worker/dispatch.ts`、`src/worker/loop.ts`
- 执行：`src/worker/run-task.ts`、`src/worker/run-retry.ts`
- 结果落盘：`src/worker/result-finalize.ts`

## 角色边界
- 只执行任务，不直接面向用户。
- 输出统一是 `TaskResult` 并发布到 `results` 队列。
- 支持 `standard` 与 `specialist` 两档执行。

## 调度模型
- 全局队列：`runtime.workerQueue`（`p-queue`）。
- 并发：`worker.maxConcurrent`。
- 去重：`task.id + sizeBy({id})`。
- 启动恢复：`hydrateRuntimeState` 后重建 pending 任务入队。

## 执行链路
1. `enqueueWorkerTask` 入队。
2. `runQueuedWorker` 标记 `running` 并持久化。
3. `runTaskWithRetry` 按 profile 执行：
   - `standard` -> `runStandardWorker`
   - `specialist` -> `runSpecialistWorker`
4. 成功/失败/取消统一走 `finalizeResult`：
   - 更新任务状态
   - 归档任务结果
   - 发布到 `results`

## 取消与重试
- `pending` 取消：直接发布 `canceled` 结果。
- `running` 取消：`AbortController.abort()`，执行链路收敛为 `canceled`。
- 重试框架：`p-retry`，abort-like 错误不消耗重试预算。

## 默认参数（worker）
- `maxConcurrent=3`
- `retryMaxAttempts=1`
- `retryBackoffMs=5000`
- `standard.timeoutMs=300000`
- `specialist.timeoutMs=600000`

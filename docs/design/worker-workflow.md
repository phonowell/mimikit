# Worker 工作流程（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 本文描述当前 worker 真实链路（以代码为准）。
- 主线代码：`src/orchestrator/roles/worker/worker-loop.ts`、`src/orchestrator/roles/worker/worker-dispatch.ts`、`src/orchestrator/roles/worker/worker-run-task.ts`、`src/orchestrator/roles/worker/worker-run-retry.ts`。
- 执行器代码：`src/worker/standard-runner.ts`、`src/worker/expert-runner.ts`。

## worker 角色边界
- 负责执行 thinker 派发任务并发布 `worker-result`。
- profile：`standard`（动作循环）/`expert`（Codex SDK）。
- 不负责直接面向用户的最终回复。

## 调度模型（P1 后）
### 事件驱动
- `create_task` 成功后：
  - 写任务历史。
  - 立即持久化 runtime。
  - 通过 `enqueueWorkerTask()` 直接入 `p-queue`。
- `workerLoop` 不再固定扫描 pending；负责：
  - 每日报告补齐（基于 reporting events）。
  - 等待唤醒信号。

### 启动恢复
- `hydrateRuntimeState()` 读取 `runtime-state.json` 后，调用 `enqueuePendingWorkerTasks()` 把恢复出来的 pending 任务重建入队。
- `running` 任务在持久化时会被降级回 `pending`，重启后可继续执行。

## 并发与去重（p-queue）
- 全局队列：`runtime.workerQueue`（concurrency=`worker.maxConcurrent`）。
- 去重：`id=task.id` + `sizeBy({id})`，避免重复入队。
- 运行态：以 `runningControllers` 为单一真值源。

## 执行生命周期
1. `enqueueWorkerTask()` 入队任务。
2. `runQueuedWorker()`：
   - 标记 running + 持久化。
   - 调 `runTask()`。
   - finally 清理运行态并持久化。
3. `runTask()` 结束后由 `finalizeResult()` 归档/发布结果。

## 重试（p-retry）
- `runTaskWithRetry()` 使用 `p-retry`。
- `signal` 透传取消；取消路径通过 `AbortError` 直接停止重试。
- `shouldConsumeRetry/shouldRetry` 对 abort-like 错误都返回 false。
- `onFailedAttempt` 统一记录日报事件、日志与重试态持久化。

## 取消路径
- `pending`：立即标记 canceled，发布 canceled 结果，持久化并唤醒 worker。
- `running`：标记 canceled + `AbortController.abort()`，由执行链路收敛为 canceled 结果。

## 状态与落盘
- 任务快照：`runtime-state.json`（pending/running 会被保留）。
- 结果通道：`channels/worker-result.jsonp`。
- 过程轨迹：`task-progress/{taskId}.jsonl`。
- checkpoint：`task-checkpoints/{taskId}.json`。
- 任务归档：`tasks/YYYY-MM-DD/*.md`。
- llm 归档：`llm/YYYY-MM-DD/*.txt`（expert 必有；standard 由步骤侧产生）。
- 日报：`reports/daily/YYYY-MM-DD.md`。

## 默认参数（worker）
- `worker.maxConcurrent = 3`
- `worker.retryMaxAttempts = 1`
- `worker.retryBackoffMs = 5000`
- `worker.standard.timeoutMs = 300000`
- `worker.expert.timeoutMs = 600000`

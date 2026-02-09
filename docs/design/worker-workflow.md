# Worker 工作流程（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 本文描述当前 `worker` 真实执行链路（以代码实现为准）。
- 主线代码：`src/orchestrator/worker-loop.ts`、`src/orchestrator/worker-run-task.ts`、`src/orchestrator/worker-run-retry.ts`。
- 执行器代码：`src/worker/standard-runner.ts`、`src/worker/expert-runner.ts`。

## worker 角色边界
- 角色定义：执行 `thinker` 派发任务，并产出 `worker-result` 事件。
- profile 分层：
  - `standard`：多轮 action/respond（API runner）。
  - `expert`：复杂任务执行（Codex SDK）。
- worker 不负责：直接面向用户输出最终回复。
- 提示词来源：`prompts/agents/worker-standard/*`、`prompts/agents/worker-expert/*`。

## 启动与输入进入
1. `Orchestrator.start()` 并发拉起 `workerLoop`。
2. thinker 通过 `create_task` action 入队到 `runtime.tasks`（`pending`）。

## workerLoop 每轮执行顺序
位于 `src/orchestrator/worker-loop.ts`，循环直到 `runtime.stopped=true`。

### 1) 空闲自演进检查
- 当系统空闲（无 thinker 运行、无 inflight 输入、无 pending/running task）且到达间隔阈值：
  - 触发 `runIdleConversationReview()`。
  - 写入反馈后更新 `runtime.evolveState.lastIdleReviewAt` 并持久化。

### 2) 并发调度
- 若 `runningWorkers.size < config.worker.maxConcurrent`：
  - 从任务队列选择下一个 `pending`（`pickNextPendingTask`）。
  - 异步 `spawnWorker(runtime, task)`。

### 3) spawnWorker 生命周期
- 防重入：非 `pending` 或已在 `runningWorkers` 中时直接返回。
- 标记运行：
  - `runningWorkers.add(task.id)`
  - `runningControllers.set(task.id, AbortController)`
  - `markTaskRunning()` + 持久化 runtime
- 执行 `runTask()`。
- finally 中清理运行态并再次持久化。

## runTask 细节
实现：`src/orchestrator/worker-run-task.ts`。

### 1) 启动日志
- 写 `worker_start`（taskId/profile/promptChars）。

### 2) 执行与重试
- 调 `runTaskWithRetry()`：
  - `standard` 走 `runStandardWorker()`
  - `expert` 走 `runExpertWorker()`
- 失败时按 `retryMaxAttempts` + `retryBackoffMs` 重试，并写 `worker_retry` 日志与反馈。

### 3) 成功/失败收敛
- 成功：构造 `succeeded` 结果并 `finalizeResult()`。
- 取消态成功返回：构造 `canceled` 结果并 `finalizeResult()`。
- 异常：
  - 若任务已取消，仍落 `canceled` 结果。
  - 否则落 `failed` 结果，并写失败反馈。

## finalizeResult 细节
实现：`src/orchestrator/worker-result.ts`。

- 归档结果到 `tasks/YYYY-MM-DD/*.md`（成功/失败/取消均走归档）。
- 更新任务终态与耗时/usage/archivePath。
- 发布 `worker-result` 到 `channels/worker-result.jsonp`。
- 写 `worker_end` 日志。

## standard 执行器细节
实现：`src/worker/standard-runner.ts`。

- 启动时加载 checkpoint（若有）并写 `standard_start`/`standard_resume` 进度。
- 循环直至 `finalized=true`：
  - 约束：超时、abort、最大轮数保护。
  - 每轮调用 planner prompt，解析最后一个有效 step。
  - `respond`：结束任务并保存 checkpoint。
  - `action`：执行 action，写 `action_call_start/end` 进度并写回 checkpoint。
- 进度落盘：`task-progress/{taskId}.jsonl`。
- checkpoint 落盘：`task-checkpoints/{taskId}.json`。

## expert 执行器细节
实现：`src/worker/expert-runner.ts`。

- 单次构建 worker prompt 后调用 `runCodexSdk()`。
- 成功/失败均写 llm archive（含错误信息）。
- 返回 `output/elapsedMs/usage` 给上层收敛。

## 取消路径
实现：`src/orchestrator/cancel.ts`。

- `pending` 任务：立即标记取消，直接发布 `canceled` 结果。
- `running` 任务：标记取消并触发 `AbortController.abort()`，由执行链路收敛为 `canceled` 结果。
- 两类取消都会写日志并持久化 runtime。

## worker 与 thinker/teller 的耦合点
- `thinker -> worker`：`create_task` / `cancel_task` action。
- `worker -> teller`：发布 `worker-result` 事件（当前由 teller 消费）。
- `worker -> thinker`：当前为间接链路（经 teller digest 汇总后再到 thinker）。

## 状态与落盘
- 任务快照：`runtime-state.json`（任务状态、attempts、cursor 等）。
- 结果通道：`channels/worker-result.jsonp`。
- 过程轨迹：`task-progress/{taskId}.jsonl`。
- 断点快照：`task-checkpoints/{taskId}.json`。
- 任务归档：`tasks/YYYY-MM-DD/*.md`。
- llm 归档：`llm/YYYY-MM-DD/*.txt`（expert 始终；standard 由步骤调用侧产生）。

## 默认时序参数（影响 worker）
来源：`src/config.ts`。

- `worker.maxConcurrent = 3`
- `worker.retryMaxAttempts = 1`
- `worker.retryBackoffMs = 5000`
- `worker.standard.timeoutMs = 300000`
- `worker.expert.timeoutMs = 600000`

# 任务系统

> 返回 [系统设计总览](./README.md)

## 任务生命周期
- `pending`：thinker 已派发，等待 worker 执行。
- `running`：worker 已接单执行。
- `succeeded|failed|canceled`：终态。

## 派发规则
- thinker 通过 `@create_task` 创建任务。
- 派发时附带 `profile`：`standard` 或 `expert`。
- 去重基于 prompt fingerprint，避免重复派单。
- 创建成功后立即持久化 runtime，并通过 `enqueueWorkerTask` 入 `p-queue`。

## 执行规则
- worker 并发由 `runtime.workerQueue` 控制，`concurrency=worker.maxConcurrent`。
- `workerLoop` 不再扫描 pending；负责日报补齐与信号等待。
- 启动恢复时，`hydrateRuntimeState` 后会将 pending 任务重建入队。
- `standard` 任务走 `src/worker/standard-runner.ts`。
- `expert` 任务走 `src/worker/expert-runner.ts`。
- 结果统一回写 `worker-result.jsonp`。

## 标准 worker 运行特性
- `standard` 采用多轮 step 执行（action/respond），不是单次对话。
- `standard` 可调用内部 action：`read_file` / `write_file` / `edit_file` / `exec_shell` / `run_browser`。

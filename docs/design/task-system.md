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

## 执行规则
- workerLoop 按 `maxConcurrent` 并发调度。
- `standard` 任务走 `src/worker/standard-runner.ts`。
- `expert` 任务走 `src/worker/expert-runner.ts`。
- 结果统一回写 `worker-result.jsonp`。

## 标准 worker 运行特性
- `standard` 采用多轮 step 执行（action/respond），不是单次对话。
- `standard` 可调用内部 action：`read_file` / `write_file` / `edit_file` / `exec_shell` / `run_browser`。
- 运行过程会记录进度：`.mimikit/task-progress/{taskId}.jsonl`。
- 每轮会保存 checkpoint：`.mimikit/task-checkpoints/{taskId}.json`。
- 任务恢复时可从 checkpoint 继续；可通过 `GET /api/tasks/:id/progress` 查看过程。

## 取消规则
- thinker 可通过 `@cancel_task` 请求取消。
- pending 任务立即终止并生成 canceled 结果。
- running 任务触发 `AbortController` 取消。

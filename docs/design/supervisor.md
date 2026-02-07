# Supervisor

> 返回 [系统设计总览](./README.md)

## 双循环
Supervisor 启动两条循环，均在同一进程内：

1) **Manager Loop**
- 轮询内存输入/结果缓冲。
- 输入满足 debounce 或结果等待超时后调用 Manager。
- 解析输出中的 `<MIMIKIT:commands>` 命令块并执行：
  - `@add_task` / `@cancel_task`

2) **Worker Loop**
- 并发上限 `worker.maxConcurrent`。
- FIFO 取 `status=pending` 的任务执行。
- 拉起即标记 `running`。
- 失败任务按 `worker.retryMaxAttempts` 自动重试（线性退避 `worker.retryBackoffMs`）。
- 完成后回传结果给 Manager，并标记任务 `succeeded`/`failed`。
- 结果同时写入 .mimikit/tasks/YYYY-MM-DD/ 归档文件。

3) **Idle Evolve Loop**
- 仅在系统空闲时触发（manager 未运行、无待处理输入/结果、无 worker 在跑）。
- 消费 `POST /api/feedback` 收集的反馈（`.mimikit/evolve/feedback.jsonl`）。
- 生成反馈派生 replay suite（`.mimikit/evolve/feedback-suite.json`），执行自演进闭环。
- 按阈值策略自动判定是否保留候选 prompt，不满足则自动回滚。
- 运行结果写入日志事件：`evolve_idle_run` / `evolve_idle_error`。

## 并发与恢复
- Manager：单线程。
- Worker：并行执行。
- 运行时快照：`.mimikit/runtime-state.json` 持久化活跃任务与 token 预算。
- 进程重启：`running` 任务恢复为 `pending` 并继续执行。
- 停机/重启前会执行快照持久化，降低异常中断导致的状态丢失。
- 已完成结果落盘归档，不依赖进程存活。

## 成本闸门
- 每日 token 预算：`tokenBudget.dailyTotal`（默认启用）。
- 预算达到上限后：停止新任务派发与 worker 拉起，避免失控消耗。

## 日志
- `log.jsonl` 记录关键事件（输入、manager/worker start/end、错误）。
- 日志轮转逻辑见 `src/log/append.ts`。

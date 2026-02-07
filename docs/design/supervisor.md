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
- 当系统空闲且存在未处理反馈时，自动创建 `system_evolve` 系统任务，由 worker 执行自演进。
- 自演进任务闭环：评测 → Prompt/代码变更 → 验证 → 回滚/保留。
- 支持通过 `MIMIKIT_EVOLVE_AUTO_RESTART_ON_PROMOTE` 在验证通过后自动重启应用更新。
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

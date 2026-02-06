# Supervisor

> 返回 [系统设计总览](./README.md)

## 双循环
Supervisor 启动两条循环，均在同一进程内：

1) **Manager Loop**
- 轮询内存输入/结果缓冲。
- 输入满足 debounce 或结果等待超时后调用 Manager。
- 解析输出中的 `<MIMIKIT:commands>` 命令块并执行：
  - `@add_task` / `@cancel_task`
  - `@read_file`（同步工具调用，结果回注到下一轮 manager 推理）

2) **Worker Loop**
- 并发上限 `worker.maxConcurrent`。
- FIFO 取 `status=pending` 的任务执行。
- 拉起即标记 `running`。
- 完成后回传结果给 Manager，并标记任务 `succeeded`/`failed`。
- 结果同时写入 .mimikit/tasks/YYYY-MM-DD/ 归档文件。

## 并发与恢复
- Manager：单线程。
- Worker：并行执行。
- 任务在内存；进程重启会丢失未完成任务。
- 已完成结果落盘归档，不依赖进程存活。

## 日志
- `log.jsonl` 记录关键事件（输入、manager/worker start/end、错误）。
- 日志轮转逻辑见 `src/log/append.ts`。

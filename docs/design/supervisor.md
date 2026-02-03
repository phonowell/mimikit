# Supervisor

> 返回 [系统设计总览](./README.md)

## 双循环
Supervisor 启动两条循环，均在同一进程内：

1) **Manager Loop**
- 轮询内存输入/结果缓冲。
- 输入满足 debounce 或结果等待超时后调用 Manager。
- 解析输出中的 `<MIMIKIT:dispatch_worker ... />` 并入队。

2) **Worker Loop**
- 并发上限 `worker.maxConcurrent`。
- FIFO 取 `status=pending` 的任务执行。
- 完成后回传结果给 Manager，并标记任务 done。

## 并发与恢复
- Manager：单线程。
- Worker：并行执行。
- 任务与结果均在内存；进程重启会丢失未完成任务。

## 日志
- `log.jsonl` 记录关键事件（输入、manager/worker start/end、错误）。
- 日志轮转逻辑见 `src/log/append.ts`。

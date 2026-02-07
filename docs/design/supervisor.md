# Supervisor

> 返回 [系统设计总览](./README.md)

## 双循环
Supervisor 在同一进程内运行两条循环：

1) Manager Loop
- 轮询输入/结果缓存
- 满足防抖或等待超时后调用 Manager
- 解析 `<MIMIKIT:commands>` 并执行任务控制命令

2) Worker Loop
- 并发上限由 `worker.maxConcurrent` 控制
- 按 FIFO 处理 `pending` 任务
- 支持失败重试（`retryMaxAttempts` + `retryBackoffMs`）
- 完成后写入任务归档并回传给 Manager
- 空闲时可执行 idle review，写入反馈信号

## 持久化与恢复
- 运行时快照：`.mimikit/runtime-state.json`
- 重启后会恢复未完成任务为 `pending`
- 已完成结果通过归档持久化，不依赖进程内存

## 成本闸门
- 每日 token 预算：`tokenBudget.dailyTotal`
- 达到预算上限后暂停新任务派发

## 日志
- `log.jsonl` 记录关键事件（输入、执行、错误等）

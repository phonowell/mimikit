# Supervisor

> 返回 [系统设计总览](./README.md)

## 三循环
Supervisor 启动三条循环，均在同一进程内：

1) **Teller Loop**
- 轮询 `teller-notices.jsonl` 与内存输入缓冲。
- 满足 debounce / notice wait 时调用 Teller。
- 解析输出中的 `<MIMIKIT:record_input>...</MIMIKIT:record_input>` 并写入/更新 `user-inputs.jsonl`。

2) **Thinker Loop**
- 条件：有未处理输入或有任务结果。
- 若有用户输入，要求 Teller 已回复且静默 ≥ `thinker.settleMs`。
- 读取 inputs/results/queue，调用 Thinker，执行 MIMIKIT 命令。
- 维护 `thinker-state.json` 的 sessionId 与 notes。

3) **Worker Loop**
- 并发上限 `worker.maxConcurrent`。
- 按优先级 + 依赖 + 定时筛选任务（见 task-system）。
- 执行后写入 `agent-results/`，并更新任务 status。

## 并发与恢复
- Teller / Thinker：单线程。
- Worker：并行执行，不再使用 running 目录。
- 状态完全从文件推导，进程重启后可继续运行。

## 日志
- `log.jsonl` 记录关键事件（输入、teller/thinker/worker 的 start/end、错误）。
- 日志轮转逻辑见 `src/log/append.ts`。

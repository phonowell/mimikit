# Manager 工作流（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 主循环：`src/manager/loop.ts`
- LLM 执行：`src/manager/runner.ts`
- 动作执行：`src/manager/action-apply.ts`
- 历史写入：`src/manager/history.ts`

## 角色边界
- 直接消费 `inputs/results`。
- 负责“用户可见回复 + 任务编排动作”。
- 不执行具体任务；任务执行由 worker 负责。

## 每轮顺序
1. 按 `manager.minIntervalMs` 节流。
2. 从 `inputs/results` 按 cursor 增量拉取 batch。
3. 若无新数据则 sleep。
4. 裁剪近期 `history/tasks` 组成 prompt 上下文。
5. 执行 `runManager`，解析动作块。
6. 把已消费 `inputs/results` 写入 `history`（含任务系统消息）。
7. 执行 `create_task/cancel_task`，并合并 `summarize_task_result`。
8. 写 assistant 回复。
9. 推进并持久化 queue cursor，压缩 queue（已全消费且达到阈值时清空并归零 cursor），写任务快照。

## 错误路径
- manager 失败时先尝试补齐本批次消费并推进 cursor，避免同一批次反复重放。
- fallback 系统消息仅在“本批次成功排空 + 尚未写 assistant 回复 + 有新用户输入”时写入。
- 记录 `manager_end` error 日志，并持久化 runtime。

## 默认参数（manager）
- `pollMs=1000`
- `minIntervalMs=8000`
- `maxBatch=100`
- `queueCompactMinPackets=1000`
- `taskSnapshotMaxCount=2000`
- `historyMinCount=20`
- `historyMaxCount=100`
- `historyMaxBytes=20480`
- `tasksMinCount=5`
- `tasksMaxCount=20`
- `tasksMaxBytes=20480`

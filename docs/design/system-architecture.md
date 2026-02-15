# 系统架构总览（当前实现）
> 返回 [系统设计总览](./README.md)

## 架构边界
- 一次性全量切换，不保留运行期兼容层。
- `OpenCode` 作为主 session 编排引擎（manager 主路径）。
- `Codex` 作为能力增强（worker specialist 路径）。
- `mimikit` 负责本地持久化执行系统：队列、状态机、调度、可观测性。

## 组件职责
- `manager`
  - 消费 `inputs/results/wakes` 增量事件。
  - 生成用户回复并执行任务编排动作。
  - 维护 `plannerSessionId`（主会话恢复）。
- `worker`
  - 执行 manager 下发任务。
  - 回写 `results` 与任务终态。
  - 发布 `task_done` 事件；仅 `manager` 任务终态即时唤醒 manager。
- `cron-wake-loop`
  - 持续检查 cron。
  - 触发本地任务创建并发布 `cron_due` 事件；仅存在 `manager` 任务触发时即时唤醒 manager。
- `evolver`
  - 默认关闭；仅在空闲窗口执行画像/人格演进。

## 启动顺序
实现：`src/orchestrator/core/orchestrator-service.ts`

1. `hydrateRuntimeState`
2. `enqueuePendingWorkerTasks`
3. 启动 `managerLoop`
4. 启动 `cronWakeLoop`
5. 启动 `workerLoop`
6. 若启用，启动 `evolverLoop`

## 运行态关键字段
定义：`src/orchestrator/core/runtime-state.ts`

- `managerRunning`
- `queues.inputsCursor`
- `queues.resultsCursor`
- `queues.wakesCursor`
- `plannerSessionId`
- `tasks` / `cronJobs`
- `workerQueue` / `runningControllers`

## 主链路（事件驱动）
1. 用户输入写入 `inputs/packets.jsonl`，并发布 `user_input`。
2. manager 被唤醒，消费输入/结果并调用 `runManager`（OpenCode）。
3. manager 解析动作并更新任务状态，写 assistant 回复。
4. worker 执行任务后写入 `results/packets.jsonl`，并发布 `task_done`。
5. 非 `manager` 任务默认不即时唤醒；manager 在后续触发（如用户输入）时拉取并消费结果。

唤醒事件统一为三类：
- `user_input`
- `task_done`
- `cron_due`

## Manager 循环语义
实现：`src/manager/loop.ts`

- 主循环按 cursor 拉取 `inputs/results/wakes`。
- 无可处理 batch 时进入 `waitForManagerLoopSignal(..., Infinity)`。
- 保持单飞：同一时刻仅一个活跃 manager 执行。
- 唤醒事件先持久化，处理成功后推进 cursor，保证可恢复。
- 即时唤醒分级：`user_input` 始终唤醒；`task_done/cron_due` 仅在 `manager` 任务相关时即时唤醒。

## Session 恢复机制
实现：`src/manager/runner.ts`、`src/orchestrator/core/runtime-persistence.ts`

- 持久化主会话 `plannerSessionId`。
- 启动后优先恢复 session。
- 若 session 无效，自动重建并继续服务。

## Worker 执行链路
实现：`src/worker/profiled-runner.ts`、`src/worker/result-finalize.ts`

- `standard` -> `opencode`
- `specialist` -> `codex-sdk`
- 统一收敛终态：`succeeded/failed/canceled`
- 完成后发布 `task_done`；`standard/specialist` 终态默认不即时唤醒 manager

## 状态与队列落盘
主要路径：
- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `wakes/packets.jsonl`
- `runtime-state.json`
- `history/YYYY-MM-DD.jsonl`
- `tasks/tasks.jsonl`

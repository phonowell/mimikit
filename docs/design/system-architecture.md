# 系统架构总览（当前实现）

> 返回 [系统设计总览](./README.md)

## 架构边界

- 一次性全量切换，不保留运行期兼容层。
- `OpenCode` 作为主 session 编排引擎（manager role 主路径）。
- `Codex` 作为能力增强（worker specialist 路径）。
- `mimikit` 负责本地持久化执行系统：队列、状态机、调度、可观测性。

## 组件职责

- `manager`（主编排循环）
  - 消费 `inputs/results` 增量事件。
  - 生成用户回复并创建任务动作（不直接执行）。
  - 维护 `plannerSessionId`（主会话恢复）。
- `worker`
  - 执行所有 profile 任务（deferred/standard/specialist）。
  - 回写 `results` 与任务终态。
  - 任务终态（含 `pending` 快速取消）都会即时唤醒 manager。
- `cron-wake-loop`
  - 持续检查 cron。
  - 触发本地任务创建。
  - 只要本次有触发就即时唤醒 manager。
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
- `plannerSessionId`
- `tasks` / `cronJobs`
- `workerQueue` / `runningControllers`

## 主链路（事件驱动）

1. 用户输入写入 `inputs/packets.jsonl`，并实时唤醒 manager。
2. manager 被唤醒，消费输入/结果并调用 `runManager`（OpenCode）。
3. manager 解析动作并更新任务状态，写 assistant 回复。
4. worker 执行任务终态后写入 `results/packets.jsonl`。
5. 任务终态会触发 manager signal，manager 会立即拉取并消费 results。

实时唤醒来源统一为三类：

- `user_input`
- `task_result`
- `cron`

## Manager 循环语义（manager loop）

实现：`src/manager/loop.ts`

- 主循环按 cursor 拉取 `inputs/results`。
- 无可处理 batch 时进入 `waitForManagerLoopSignal(..., Infinity)`。
- 保持单飞：同一时刻仅一个活跃 manager 执行。
- 空批次直接阻塞等待下一次唤醒 signal。

## 实时唤醒链路（生产 → 消费）

生产点：

- `user_input`：`addUserInput` 写入 input 后立即 `notifyManagerLoop`。
- `task_result`：`finalizeResult` 与 `cancelTask`（pending 快速取消）写入 result 后立即 `notifyManagerLoop`。
- `cron`：`checkCronJobs` 只要本轮有触发就立即 `notifyManagerLoop`。

消费点：

- `managerLoop` 每轮先读 `inputs/results`。
- 若无有效输入/结果：阻塞等待 manager signal。
- 若存在有效输入或结果：进入 `processManagerBatch`，在成功/失败兜底路径推进 `inputs/results` 两个 cursor。

持久化与压缩：

- batch 完成后尝试 compact 队列；仅当队列条数 `>=100` 且 cursor 已完全消费，才清空文件并把对应 cursor 复位为 `0`。

## Session 恢复机制

实现：`src/manager/runner.ts`、`src/orchestrator/core/runtime-persistence.ts`

- 持久化主会话 `plannerSessionId`。
- 启动后优先恢复 session。
- 若 session 无效，自动重建并继续服务。

## Worker 执行链路

实现：`src/worker/profiled-runner.ts`、`src/worker/result-finalize.ts`

- `manager` -> `deferred`（轻量管理任务）
- `deferred`（worker profile）-> 直接执行轻量管理任务
- `standard` -> `opencode`
- `specialist` -> `codex-sdk`
- 统一收敛终态：`succeeded/failed/canceled`
- 常规终态写 result 并即时唤醒 manager
- `pending` 快速取消同样写 result 并即时唤醒 manager

## 状态与队列落盘

主要路径：

- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `runtime-state.json`
- `history/YYYY-MM-DD.jsonl`
- `tasks/tasks.jsonl`

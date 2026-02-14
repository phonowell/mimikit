# 系统架构（当前实现）

> 返回 [系统设计总览](./README.md)

## 目标
- 用最小链路完成“输入 → 编排 → 执行 → 回复”。
- 在线执行与离线演进解耦，避免相互阻塞。
- 在能力与成本之间可切换（`standard` / `specialist`）。

## 核心角色
- `manager`
  - 读取：`inputs/results` 增量数据 + `history/tasks` 近窗。
  - 产出：用户回复 + 编排动作（`create_task` / `cancel_task` / `summarize_task_result`）。
  - 边界：不直接执行任务。
- `worker`
  - 消费 manager 派发任务。
  - 执行后写入 `results/packets.jsonl`。
  - 支持 `standard` 与 `specialist` 两档执行。
- `evolver`
  - 默认停用（`evolver.enabled=false`）。
  - 启用后仅在系统空闲时触发。
  - 基于 `history` 与模板内容更新演进文档（`user_profile.md`、`agent_persona.md`）。

## 启动与运行态
- 启动入口：`src/orchestrator/core/orchestrator-service.ts`
- `Orchestrator.start()` 顺序：
  1. `ensureStateDirs`
  2. `hydrateRuntimeState`
  3. `enqueuePendingWorkerTasks`
  4. 并发启动 `managerLoop` / `workerLoop`
  5. 若 `evolver.enabled=true`，额外启动 `evolverLoop`

运行态定义：`src/orchestrator/core/runtime-state.ts`

- 关键字段：
  - `managerRunning`
  - `inflightInputs`
  - `queues.inputsCursor` / `queues.resultsCursor`
  - `tasks`
  - `runningControllers` / `workerQueue`
  - `lastEvolverRunAt`

## 主数据流
1. 用户输入进入 `inputs/packets.jsonl`。
2. `manager` 增量消费 `inputs/results`，写入 `history` 并执行任务编排。
3. `worker` 执行任务后写入 `results/packets.jsonl`。
4. `manager` 消费结果、更新任务快照并回复用户。
5. 若 `evolver.enabled=true` 且系统空闲，`evolver` 执行画像与人格演进。

## Manager 主循环
实现：`src/manager/loop.ts`

1. 按 `manager.minIntervalMs` 节流。
2. 从 `inputs/results` 按 cursor 拉取 batch。
3. 无新数据时 sleep。
4. 裁剪 `history/tasks` 近窗生成 prompt。
5. 执行 `runManager` 并解析动作。
6. 将已消费的输入/结果写入 `history`。
7. 执行动作并合并结果摘要。
8. 写 assistant 回复。
9. 推进并持久化 cursor，必要时压缩队列。

错误路径：
- 失败时优先推进已消费 cursor，避免同批次重放。
- 满足条件时写 fallback 系统消息。
- 记录 `manager_end` error 日志并持久化 runtime。

默认参数（manager）：
- `pollMs=1000`
- `minIntervalMs=8000`
- `queueCompactMinPackets=100`（内置常量，不提供 config/env 覆盖）
- `taskSnapshotMaxCount=100`（内置常量，不提供 config/env 覆盖）
- `historyMinCount=20` / `historyMaxCount=100` / `historyMaxBytes=20480`
- `tasksMinCount=5` / `tasksMaxCount=20` / `tasksMaxBytes=20480`

## Worker 执行链路
调度与执行：`src/worker/dispatch.ts`、`src/worker/loop.ts`、`src/worker/run-task.ts`、`src/worker/run-retry.ts`

1. `enqueueWorkerTask` 入队。
2. `runQueuedWorker` 标记 `running` 并持久化。
3. `runTaskWithRetry` 按 profile 执行。
4. `finalizeResult` 统一回写状态、归档并发布结果。

取消与重试：
- `pending` 取消：直接发布 `canceled`。
- `running` 取消：`AbortController.abort()`，链路收敛为 `canceled`。
- `p-retry`：abort-like 错误不消耗重试预算。

默认参数（worker）：
- `maxConcurrent=3`
- `retryMaxAttempts=1`
- `retryBackoffMs=5000`
- `standard.timeoutMs=300000`
- `specialist.timeoutMs=600000`

## Evolver 空闲链路
实现：`src/evolver/loop.ts`

模板来源：`prompts/evolver/system.md` + `prompts/evolver/injection.md`

`injection.md` 必须包含以下块：
- `<M:persona_update>...</M:persona_update>`
- `<M:no_recent_user_input>...</M:no_recent_user_input>`
- `<M:persona_snapshot>...</M:persona_snapshot>`

触发条件：
- `managerRunning=false`
- 无 `running` / `pending` 任务
- `inflightInputs` 为空
- 空闲时长达到 `evolver.idleThresholdMs`
- 距上次执行达到 `evolver.minIntervalMs`

每轮动作：
1. 追加 `user_profile.md`（近期用户画像摘要）。
2. 追加 `agent_persona.md`（人格策略更新）。
3. 写 `agent_persona_versions/{timestamp}.md` 快照。
4. 记录 `evolver_end` 日志。

默认参数（evolver）：
- `enabled=false`
- `pollMs=2000`
- `idleThresholdMs=60000`
- `minIntervalMs=300000`

## 演进边界
- 在线链路只做观测与记录，不阻塞 manager/worker 主链路。
- 演进信息用于后续优化，不直接改写在线任务结果。
- 异常优先记录，不静默吞错。

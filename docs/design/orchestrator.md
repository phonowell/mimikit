# Orchestrator（入口与并发）

> 返回 [系统设计总览](./README.md)

## 启动入口
- 入口类：`src/orchestrator/core/orchestrator-service.ts`
- `Orchestrator.start()` 启动顺序：
  1) `ensureStateDirs`
  2) `hydrateRuntimeState`
  3) `enqueuePendingWorkerTasks`
  4) 并发启动 `managerLoop` / `evolverLoop` / `workerLoop`

## 运行态模型
- 定义：`src/orchestrator/core/runtime-state.ts`
- 核心字段：
  - `managerRunning`
  - `inflightInputs`
  - `queues.inputsCursor` / `queues.resultsCursor`
  - `tasks`
  - `runningControllers` / `workerQueue`
  - `lastEvolverRunAt`

## 输入与查询接口
- 用户输入：`addUserInput()` 发布到 `inputs` 队列。
- 读取消息：`getChatMessages()` 从 `history + inflightInputs` 构建视图。
- 读取任务：`getTasks()` 基于 runtime `tasks` 输出 view。
- 状态接口：`getStatus()` 返回 `managerRunning`、并发任务数、待处理输入数。

## 持久化职责
- `persistRuntimeState`：写 `runtime-state.json` + queues cursor state。
- `hydrateRuntimeState`：恢复 pending/running 任务与 cursor。
- worker 启动前会把恢复出的 pending 任务重新入队。

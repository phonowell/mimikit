# 系统架构总览（当前实现）

> 返回 [系统设计总览](../README.md)

## 架构边界

- 一次性全量切换，不保留旧多角色链路与旧队列字段兼容层。
- manager 使用第三方 OpenAI-compatible `chat/completions`；worker 继续使用 `Codex SDK`。
- `mimikit` 负责本地执行系统：状态机、队列、调度、可观测性。
- HTTP 输入校验与参数归一化集中在 `src/http/helpers.ts`。
- 本地持久化遵循进程内串行 + 文件锁（`proper-lockfile`）。

## 组件职责

- `manager`：消费 `inputs/results`，输出用户回复与编排动作。
- `worker`：执行统一 `worker` 任务，回写结果。
- `cron-wake-loop`：触发定时任务并发布 `system_event` 协议 system 输入事件。
- `idle-wake-loop`：系统闲暇窗口到达后发布 `system_event.name=idle` 的 system 输入事件。

system 消息协议统一为：`summary + <M:system_event name="..." version="1">JSON</M:system_event>`。

## 启动顺序

实现：`src/orchestrator/core/orchestrator-service.ts`

1. `hydrateRuntimeState`
2. `enqueuePendingWorkerTasks`
3. 启动 `managerLoop`
4. 启动 `cronWakeLoop`
5. 启动 `idleWakeLoop`
6. 启动 `workerLoop`

## 主链路（事件驱动）

1. 用户输入写入 `inputs/packets.jsonl` 并唤醒 manager。
2. manager 消费 `inputs/results` 并执行编排。
3. 若产生任务，worker 执行并写入 `results/packets.jsonl`。
4. 结果回写后再次唤醒 manager，形成闭环。

实时唤醒来源四类：`user_input`、`task_result`、`cron`、`idle`。

## 一致性与恢复

- manager loop 单飞，同一时刻仅一个活跃批次。
- 队列 compact 仅在“已完全消费且达到阈值”时执行。
- manager 上下文连续性通过 `history + tasks + managerCompressedContext` 保持，不依赖 provider thread。
- `restart/reset` 先回包，再等待 in-flight manager 批次收敛后持久化并退出。

## 细节索引

- runner/provider 执行细节：`./runners.md`
- 任务协议与状态流转：`../workflow/task-and-action.md`
- HTTP 与状态目录规范：`../workflow/interfaces-and-state.md`

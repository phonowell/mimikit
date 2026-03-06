# 系统架构总览（当前实现）

> 返回 [系统设计总览](../README.md)

## 架构边界

- 一次性全量切换到统一模型：`Task + TaskPlan + Focus`。
- 不保留旧链路兼容层（intent/cron-job 体系已移除）。
- manager 使用 direct `responses` provider（`openai-responses`）；worker 使用 `Codex SDK` 作为外部执行运行时。
- manager 对 orchestrator/worker 依赖收敛在 `src/manager/runtime-adapter.ts`。
- `mimikit` 为纯编排层：负责本地状态机、队列、调度、可观测性，不直接执行任务。
- HTTP 输入校验与参数归一化集中在 `src/http/helpers.ts`。
- 本地持久化采用进程内串行 + 文件锁（`proper-lockfile`）。

## 组件职责

- `manager`：消费 `inputs/results`，输出用户回复与编排动作。
- `worker`：派发任务到外部执行运行时，并回写结果。
- `triggerWakeLoop`：统一处理 `cron/scheduled_at/on_idle/on_worker_slot_freed` 触发并发布 `system_event.name=trigger_fire`。

补充：

- manager 回合采用 `maxCorrectionRounds` 硬上限；超过上限写入 `system_event.name=manager_round_limit` 并返回 best-effort 文本。
- manager 在发起主调用前会按 working focus 主动触发压缩；context/token 类错误仍保留一次压缩重试（`compressManagerContext`）。

## 启动顺序

实现：`src/orchestrator/core/orchestrator-service.ts`
链路：`src/orchestrator/core/orchestrator-runtime-ops.ts`

1. `hydrateRuntimeState`
2. `ensureGlobalFocus` + `enforceFocusCapacity`
3. 写入 startup system message（`Session started.`）
4. `enqueuePendingWorkerTasks` + `notifyWorkerLoop`
5. 启动 `managerLoop`
6. 启动 `triggerWakeLoop`
7. 启动 `workerLoop`

## 主链路（事件驱动）

1. 用户输入写入 `inputs/packets.jsonl` 并唤醒 manager。
2. manager 消费 `inputs/results` 并执行编排。
3. 若产生任务，worker 调用外部执行运行时并写入 `results/packets.jsonl`。
4. 结果回写后再次唤醒 manager，形成闭环。

实时唤醒来源：`user_input`、`task_result`、`trigger`、`capacity`、`slot_idle`。

## 一致性与恢复

- manager loop 单飞，同一时刻仅一个活跃批次。
- 队列 compact 仅在“已完全消费且达到阈值”时执行。
- manager 上下文连续性通过 `history + tasks + plans + managerFocusCompressedContexts` 保持。
- `restart/reset` 先回包，再等待 in-flight manager 批次收敛后持久化并退出。

## 细节索引

- runner/provider 执行细节：`./runners.md`
- 任务协议与状态流转：`../workflow/task-and-action.md`
- HTTP 与状态目录规范：`../workflow/interfaces-and-state.md`

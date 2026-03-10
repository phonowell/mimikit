# 夜班作业系统架构

> 返回 [系统设计总览](../README.md)

## 文档边界

- 本文档只描述夜班 agent 的最小必要架构：周期触发、单回路编排、外部执行、持久化恢复、最小人工确认。
- Task/Action/Plan/Focus/Memory 的具体协议仍以 `../workflow/task.md`、`../workflow/action.md`、`../workflow/plan.md`、`../workflow/focus.md`、`../workflow/memory.md` 为准。

## 架构边界

- 保留统一模型 `Task + TaskPlan + Focus`，不再维护旧链路兼容层。
- `mimikit` 只做编排层：负责本地状态机、队列、调度、可观测性，不直接执行任务。
- manager 使用 `openai-responses`；worker 按任务 `provider` 路由到 `codex-sdk` 或 `opencode-sdk`。
- 运行时状态收敛在 `session / manager / worker / ui` 四个子域，避免继续堆第二套调度或摘要层。
- HTTP 输入校验与参数归一化集中在 `src/http/helpers.ts`。
- 本地持久化采用进程内串行 + 文件锁（`proper-lockfile`）。

## 组件职责

- `manager`：消费 `inputs/results`，决定回复、任务、计划与收尾策略。
- `worker`：把任务派发给外部执行运行时，并把结果回写到本地状态。
- `managerLoop`：统一处理计划触发、choice 超时、worker 槽位释放，不再保留独立 trigger loop。
- `runtime reaper`：主进程异常退出后回收 worker 子进程。
- WebUI：只承担观察与人工确认，不承载调度策略。

约束：

- manager 回合使用 `maxCorrectionRounds` 硬上限，超过后写入 `manager_round_limit` 并返回 best-effort 文本。
- 当补充检索没有新进展时，manager 直接降级为澄清答复，不再掉进 `manager_end status=error`。
- 当同类 `action_execution_rejected` 在同一批次内重复出现时，manager 按动作类别给出替代路径并停止继续重试。
- worker 同时保留长任务软阈值观测与最小预算治理：命中 `worker.budget.maxDurationMs/maxRounds` 时写出 `partial` 结果、归档 handoff、保留 session，并把任务落到 `paused`。

## 启动顺序

实现入口：

- `src/orchestrator/core/orchestrator-service.ts`
- `src/orchestrator/core/orchestrator-channel-lifecycle.ts`
- `src/orchestrator/core/orchestrator-input-ingress.ts`
- `src/orchestrator/core/orchestrator-chat-history.ts`
- `src/orchestrator/core/orchestrator-runtime-lifecycle.ts`

1. `hydrateRuntimeState`
2. `ensureGlobalFocus` + `enforceActiveFocusLimit` + `pruneArchivedFocuses`
3. 写入 startup system message（`Session started.`）
4. `enqueuePendingWorkerTasks` + `notifyWorkerLoop`
5. 启动 `managerLoop`
6. 启动 `workerLoop`

## 主链路（事件驱动）

1. 用户输入、计划触发、worker 结果先写入本地队列。
2. `managerLoop` 消费这些输入并执行编排。
3. 若产生任务，worker 调用外部运行时执行并写回 `results/packets.jsonl`。
4. manager 再次被唤醒，直到本轮走到明确收尾条件。

明确收尾条件只有三类：

- `task_completed status=succeeded`：任务完成并归档。
- `task_completed status=partial task_status=paused stop_reason=budget_exhausted`：预算暂停，已有部分结果，可显式恢复。
- manager best-effort 收敛：输入不足、守卫拒绝或检索无进展时直接给出下一步，不再空转。

实时唤醒来源：`user_input`、`task_result`、`trigger_fire`、`worker_slot_freed`。

## 一致性与恢复

- manager loop 单飞，同一时刻只允许一个活跃批次。
- 队列 compact 只在“已完全消费且达到阈值”时执行。
- 上下文连续性依赖 `history + tasks + plans + focus` 落盘，而不是再造独立记忆总线。
- `restart/reset` 先回包，再等待 in-flight manager 批次收敛后持久化退出。
- 进程被杀（如 `SIGKILL`）时由 `runtime reaper` 基于 `.mimikit/runtime/lease.json` 与 `.mimikit/runtime/children.json` 执行回收。

## 细节索引

- runner/provider 执行细节：`./runners.md`
- 任务协议与状态流转：`../workflow/task-and-action.md`
- HTTP 与状态目录规范：`../workflow/interfaces-and-state.md`

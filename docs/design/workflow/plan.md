# 计划（Plan / TaskPlan）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- 本文档是 Plan 领域的单一主规范（single source of truth），覆盖生命周期、触发机制、调度语义、去重归属与关联 Action。
- 涉及 Plan 的设计记录、提案、讨论稿仅作背景参考，不构成并行规范。
- 若与其他文档表述冲突，以本文档与对应实现代码（`src/manager/*`、`src/orchestrator/*`）为准。

## 生命周期

- 对外名称：Plans；后端领域名：`taskPlans`
- 状态：`active | blocked | done`
- 完成原因：`completed | exhausted | canceled`
- 触发策略：`trigger.mode = cron | scheduled_at | on_worker_slot_freed`
- 生效动作：`effect.kind = enqueue_task | wake_manager`
- 结构分层：`TaskPlan` 顶层只保留声明式调度语义；运行态 bookkeeping 统一收进 `plan.runtime`

## 触发机制

- `managerLoop`（`src/manager/loop.ts`）在空闲轮询中统一检查计划触发、待确认 choice 生命周期与 worker 槽位释放。
- `cron/scheduled_at`：命中即执行结构化 `effect`，并发布 `trigger_fire` system input 记录触发事实与 payload。
- `on_worker_slot_freed`：在“有空槽位”窗口触发，候选计划按 `priority -> createdAt(FIFO)` 排序执行。
- 若槽位释放时无可触发 `on_worker_slot_freed` 计划，系统会发布 `worker_slot_freed` system input，并写入结构化槽位 payload。

## 调度语义基线（槽位口径）

- 槽位状态字段统一为：`max_slots`、`occupied_slots`、`available_slots`。
- `available_slots = max_slots - occupied_slots`。
- `occupied_slots = max(workerQueue.pending, runningControllers.size)`，并限制在 `[0, max_slots]`。
- `on_worker_slot_freed` 触发前置条件：`available_slots > 0`。
- 槽位事件带 1 秒冷却（`WORKER_SLOT_EVENT_COOLDOWN_MS`）。

## 去重与归属

- plan action 去重键：`title + focusId + effect签名 + trigger签名`
- 每条 `TaskPlan` 必带 `focusId`

## 相关 Action

- `create_plan`
  - 入参：`title`、`trigger_mode`、`focus_id?`、`priority?`、`max_runs?`
  - 触发参数：`cron_expr? | scheduled_at? | time_zone?`
  - effect 参数：
    - `effect_kind="enqueue_task"`：`task_title`、`task_worker_prompt`、`task_cwd`、`task_goal`、`task_in_scope`、`task_done_when_{n}`，可选 `task_branch` / `task_out_of_scope` / `task_context_ref_{n}`
    - `effect_kind="wake_manager"`：`effect_reason`
- `update_plan`
  - 入参：`id` + 至少一个更新字段
  - 可更新：`title|trigger_mode|cron_expr|scheduled_at|time_zone|max_runs|priority|status|focus_id|effect_*|task_*`
- `delete_plan`
  - 入参：`id`

## 触发后的状态收敛

- `scheduled_at` 触发后立即标记 `done(completed)`（一次性）。
- `cron` 若表达式无下一次触发，则标记 `done(completed)`。
- 达到 `max_runs` 时标记 `done(exhausted)`。

## 校验边界

- `create_plan/update_plan` 中 `trigger_mode=scheduled_at` 时会校验时间不得早于“当前用户上下文时间”（若有）或系统当前时间。
- `trigger_mode=on_worker_slot_freed` 与 `cron/scheduled_at` 参数互斥。
- `update_plan` 对 `done` 计划默认拒绝。
- `plan.runtime.runCount/lastTriggeredAt/lastTaskId/closedAt/doneReason` 只允许由触发执行链路维护，不对 manager action 暴露写入口。
- `lastTaskId` 由运行时在 `trigger_fire -> enqueue_task` 成功落到既有/新建任务时自动回写，不再由 manager action 显式维护。
- `effect_kind="enqueue_task"` 必须能构出完整 task contract；`effect_kind="wake_manager"` 仅允许受限 reason，不再接受自由文本 prompt。

## 关联数据结构

定义：`src/types/index.ts`

- `TaskPlan`
- `TaskPlanTrigger`
- `TaskPlanEffect`
- `TaskPlanRuntime`

运行态字段：

- `runtime.runCount`：已触发次数
- `runtime.lastTriggeredAt`：最近一次触发时间
- `runtime.lastTaskId`：最近一次触发关联到的 task
- `runtime.closedAt`：进入 `done` 的关闭时间
- `runtime.doneReason`：`canceled | completed | exhausted`

## 示例

- `on_worker_slot_freed`：
  `<M:create_plan title="积压任务续跑" trigger_mode="on_worker_slot_freed" max_runs="20" effect_kind="enqueue_task" task_title="继续处理积压任务" task_worker_prompt="阅读当前状态并处理下一批积压任务" task_cwd="/Users/mimiko/Projects/mimikit" task_goal="推进积压任务处理" task_in_scope="仅处理当前 focus 的积压项" task_done_when_1="输出本轮处理结果与下一步" />`
- `scheduled_at`：
  `<M:create_plan title="下午复盘" trigger_mode="scheduled_at" scheduled_at="2026-03-21T16:00:00+08:00" effect_kind="wake_manager" effect_reason="scheduled_review" />`

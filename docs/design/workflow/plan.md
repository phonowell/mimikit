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

## 触发机制

- `managerLoop`（`src/manager/loop.ts`）在空闲轮询中统一检查计划触发、待确认 choice 生命周期与 worker 槽位释放。
- `cron/scheduled_at`：命中即发布 `trigger_fire` system input，并写入 `systemEventName/systemEventPayload`。
- `on_worker_slot_freed`：在“有空槽位”窗口触发，候选计划按 `priority -> createdAt(FIFO)` 排序执行。
- 若槽位释放时无可触发 `on_worker_slot_freed` 计划，系统会发布 `worker_slot_freed` system input，并写入结构化槽位 payload。

## 调度语义基线（槽位口径）

- 槽位状态字段统一为：`max_slots`、`occupied_slots`、`available_slots`。
- `available_slots = max_slots - occupied_slots`。
- `occupied_slots = max(workerQueue.pending, runningControllers.size)`，并限制在 `[0, max_slots]`。
- `on_worker_slot_freed` 触发前置条件：`available_slots > 0`。
- 槽位事件带 1 秒冷却（`WORKER_SLOT_EVENT_COOLDOWN_MS`）。

## 去重与归属

- plan action 去重键：`prompt + title + profile + focusId + trigger签名`
- 每条 `TaskPlan` 必带 `focusId`

## 相关 Action

- `create_plan`
  - 入参：`prompt`、`title`、`trigger_mode`、`focus_id?`、`priority?`、`source?`
  - 触发参数：`cron? | scheduled_at? | max_runs?`
- `update_plan`
  - 入参：`id` + 至少一个更新字段
  - 可更新：`prompt|title|trigger_mode|cron|scheduled_at|max_runs|priority|source|status|focus_id`
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
- `lastTaskId` 由运行时在 `trigger_fire -> enqueue_task` 成功落到既有/新建任务时自动回写，不再由 manager action 显式维护。

## 关联数据结构

定义：`src/types/index.ts`

- `TaskPlan`

## 示例

- `on_worker_slot_freed`：`<M:create_plan prompt="有空槽位就处理下一批积压任务" title="积压任务续跑" trigger_mode="on_worker_slot_freed" max_runs="20" />`

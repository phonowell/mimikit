# 计划（Plan / TaskPlan）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- 对外名称：Plans；后端领域名：`taskPlans`
- 状态：`active | blocked | done`
- 触发策略：`trigger.mode = cron | scheduled_at | on_worker_slot_freed`

## 触发机制

- `triggerWakeLoop`（`src/manager/loop-trigger.ts`）每秒检查 plan
- `cron/scheduled_at`：命中即发布 `system_event.name=trigger_fire`
- `on_worker_slot_freed`：worker 从“满载”转为“有空槽位”时按 `priority + FIFO` 触发

## 调度语义基线（槽位口径）

- 槽位状态字段统一为：`max_slots`、`occupied_slots`、`available_slots`。
- `available_slots = max_slots - occupied_slots`。
- `occupied_slots = max(workerQueue.pending, runningControllers.size)`，并限制在 `[0, max_slots]`。
- `on_worker_slot_freed` 条件：`available_slots > 0`。
- worker 出队语义：仅受 `maxConcurrent` 与任务去重约束；同一 `focusId` 的任务在有空槽时允许并行运行。

## 去重与归属

- plan action 去重键：`prompt + title + profile + focusId + trigger签名`
- 每条 `TaskPlan` 必带 `focusId`

## 相关 Action

- `create_plan`
  - 入参：`prompt`、`title`、`trigger_mode`、`focus_id?`、`priority?`、`source?`
  - 触发参数：`cron? | scheduled_at? | max_runs?`
- `update_plan`
  - 入参：`id` + 至少一个更新字段
  - 可更新：`prompt|title|trigger_mode|cron|scheduled_at|max_runs|priority|source|status|last_task_id|focus_id`
- `delete_plan`
  - 入参：`id`

## 关联数据结构

定义：`src/types/index.ts`

- `TaskPlan`

## 示例

- `on_worker_slot_freed`：`<M:create_plan prompt="有空槽位就处理下一批积压任务" title="积压任务续跑" trigger_mode="on_worker_slot_freed" max_runs="20" />`

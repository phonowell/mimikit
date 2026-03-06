# 计划（Plan / TaskPlan）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- 对外名称：Plans；后端领域名：`taskPlans`
- 状态：`active | blocked | done`
- 触发策略：`trigger.mode = cron | scheduled_at | on_idle | on_worker_slot_freed`

## 触发机制

- `triggerWakeLoop`（`src/manager/loop-trigger.ts`）每秒检查 plan
- `cron/scheduled_at`：命中即发布 `system_event.name=trigger_fire`
- `on_idle`：仅当 worker 槽位全空（`available_slots == max_slots`）且达到空槽窗口后按 `priority + FIFO` 触发
- `on_worker_slot_freed`：worker 从“满载”转为“有空槽位”时按 `priority + FIFO` 触发
- `on_idle` 冷却：`now - lastCompletedAt >= cooldownMs`
- `on_idle` 默认运行次数：未显式传 `max_runs` 时，创建后默认 `maxRuns=1`（一次触发后转 `done`）

## 调度语义基线（槽位口径）

- 槽位状态字段统一为：`max_slots`、`occupied_slots`、`available_slots`。
- `available_slots = max_slots - occupied_slots`。
- `occupied_slots = max(workerQueue.pending, runningControllers.size)`，并限制在 `[0, max_slots]`。
- `on_idle` 判定等价于 `available_slots == max_slots`；实现上允许最小门禁 `managerRunning === false` 以避免 manager 正在处理中重复触发。
- `on_worker_slot_freed` 条件：`available_slots > 0`，不要求 `available_slots == max_slots`。
- 队列建议：希望“释放一个槽位就继续派发/续跑”时用 `on_worker_slot_freed`；只希望“槽位全部释放后再触发”时用 `on_idle`。
- worker 出队语义：仅受 `maxConcurrent` 与任务去重约束；同一 `focusId` 的任务在有空槽时允许并行运行。

### 非 `on_idle` 但 `slot_freed=true` 示例

- 示例 A：`managerRunning=true`，worker 当前没有运行任务，`maxConcurrent=2`。结果：`on_idle` 不触发（门禁），`worker_slot_freed=true`。
- 示例 B：`maxConcurrent=4`，`runningControllers.size=2` 且仍有排队任务。结果：`on_idle=false`（槽位未全空），`worker_slot_freed=true`（仍有 2 个空槽位）。

## 去重与归属

- plan action 去重键：`prompt + title + profile + focusId + trigger签名`
- 每条 `TaskPlan` 必带 `focusId`

## 相关 Action

- `create_plan`
  - 入参：`prompt`、`title`、`trigger_mode`、`focus_id?`、`priority?`、`source?`
  - 触发参数：`cron? | scheduled_at? | cooldown_ms? | max_runs?`（`cooldown_ms` 仅 `on_idle`）
- `update_plan`
  - 入参：`id` + 至少一个更新字段
  - 可更新：`prompt|title|trigger_mode|cron|scheduled_at|cooldown_ms|max_runs|priority|source|status|last_task_id|focus_id`
- `delete_plan`
  - 入参：`id`

## 关联数据结构

定义：`src/types/index.ts`

- `TaskPlan`

## 示例

- `on_idle`：`<M:create_plan prompt="槽位全空后整理日志" title="日志整理" trigger_mode="on_idle" cooldown_ms="300000" />`
- `on_worker_slot_freed`：`<M:create_plan prompt="有空槽位就处理下一批积压任务" title="积压任务续跑" trigger_mode="on_worker_slot_freed" max_runs="20" />`

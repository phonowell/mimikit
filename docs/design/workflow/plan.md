# 计划（Plan / TaskPlan）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- 对外名称：Plans；后端领域名：`taskPlans`
- 状态：`active | blocked | done`
- 触发策略：`trigger.mode = cron | scheduled_at | on_idle | on_worker_slot_freed`

## 触发机制

- `triggerWakeLoop`（`src/manager/loop-trigger.ts`）每秒检查 plan
- `cron/scheduled_at`：命中即发布 `system_event.name=trigger_fire`
- `on_idle`：manager 与 worker 均空闲且达到空闲窗口后按 `priority + FIFO` 触发
- `on_worker_slot_freed`：worker 从“满载”转为“有空槽位”时按 `priority + FIFO` 触发
- `on_idle` 冷却：`now - lastCompletedAt >= cooldownMs`
- 语义区分：`on_worker_slot_freed` 是“边沿触发”（full -> free 时触发一次），`available_slots > 0` 只是“容量可用”状态（level）。

## idle vs worker-slot-freed

- `on_idle`：要求系统整体空闲，适合“完全不忙时再做”的低优先级任务。
- `on_worker_slot_freed`：只要求 worker 至少有 1 个空槽位，不要求 manager/其他 worker 全部空闲，适合队列持续出队场景。
- 队列建议：有并发 worker 且希望“释放一个槽位就继续派发/续跑”时，用 `on_worker_slot_freed`；只希望“所有任务处理完再触发”时，用 `on_idle`。
- 示例 A：`managerRunning=true` 且 `available_slots=1`，结果：`global idle=false`，但 `on_worker_slot_freed` 触发条件仍可成立（若刚发生 full -> free）。
- 示例 B：`available_slots` 长时间保持 `> 0` 且无“满载->空槽位”新边沿，结果：不会重复触发 `on_worker_slot_freed`。

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

- `on_idle`：`<M:create_plan prompt="空闲时整理日志" title="日志整理" trigger_mode="on_idle" cooldown_ms="300000" />`
- `on_worker_slot_freed`：`<M:create_plan prompt="有空槽位就处理下一批积压任务" title="积压任务续跑" trigger_mode="on_worker_slot_freed" max_runs="20" />`

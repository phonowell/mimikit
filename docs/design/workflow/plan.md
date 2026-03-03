# 计划（Plan / TaskPlan）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- 对外名称：Plans；后端领域名：`taskPlans`
- 状态：`active | blocked | done`
- 触发策略：`trigger.mode = cron | scheduled_at | on_idle | on_worker_slot_available`

## 触发机制

- `triggerWakeLoop`（`src/manager/loop-trigger.ts`）每秒检查 plan
- `cron/scheduled_at`：命中即发布 `system_event.name=trigger_fire`
- `on_idle`：manager 与 worker 均空闲且达到空闲窗口后按 `priority + FIFO` 触发
- `on_worker_slot_available`：worker 从“满载”转为“有空槽位”时按 `priority + FIFO` 触发
- `on_idle` 冷却：`now - lastCompletedAt >= cooldownMs`

## idle vs worker-slot-available

- `on_idle`：要求系统整体空闲，适合“完全不忙时再做”的低优先级任务。
- `on_worker_slot_available`：只要求 worker 至少有 1 个空槽位，不要求 manager/其他 worker 全部空闲，适合队列持续出队场景。
- 队列建议：有并发 worker 且希望“释放一个槽位就继续派发/续跑”时，用 `on_worker_slot_available`；只希望“所有任务处理完再触发”时，用 `on_idle`。

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
- `on_worker_slot_available`：`<M:create_plan prompt="有空槽位就处理下一批积压任务" title="积压任务续跑" trigger_mode="on_worker_slot_available" max_runs="20" />`

# 计划（Plan / TaskPlan）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- 对外名称：Plans；后端领域名：`taskPlans`
- 状态：`active | blocked | done`
- 触发策略：`trigger.mode = cron | scheduled_at | on_idle`

## 触发机制

- `trigger-wake-loop` 每秒检查 plan
- `cron/scheduled_at`：命中即发布 `system_event.name=trigger_fire`
- `on_idle`：达到闲暇窗口后按 `priority + FIFO` 触发
- `on_idle` 冷却：`now - lastCompletedAt >= cooldownMs`

## 去重与归属

- plan action 去重键：`prompt + title + profile + focusId + trigger签名`
- 每条 `TaskPlan` 必带 `focusId`

## 相关 Action

- `create_plan`
  - 入参：`prompt`、`title`、`trigger_mode`、`focus_id?`、`priority?`、`source?`
  - 触发参数：`cron? | scheduled_at? | cooldown_ms? | max_runs?`
- `update_plan`
  - 入参：`id` + 至少一个更新字段
  - 可更新：`prompt|title|trigger_mode|cron|scheduled_at|cooldown_ms|max_runs|priority|source|status|last_task_id|focus_id`
- `delete_plan`
  - 入参：`id`

## 关联数据结构

定义：`src/types/index.ts`

- `TaskPlan`

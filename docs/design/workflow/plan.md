# 计划（Plan / TaskPlan）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- Plan 主规范覆盖生命周期、触发机制、调度语义与 manager action 合同
- 对应实现主源：`src/policy/manager/action-apply-plan.ts`、`src/policy/manager/action-plan-effect.ts`、`src/policy/manager/loop-trigger-plan-execution.ts`

## 生命周期

- 状态：`active | blocked | done`
- 关闭原因：`completed | exhausted | canceled`
- 触发策略：`trigger.mode = cron | scheduled_at | on_worker_slot_freed`
- 运行态 bookkeeping 统一放进 `plan.runtime`

## 对外 Action

- `set_plan`
- `delete_plan`

不存在：

- `create_plan`
- `update_plan`
- `wake_manager` effect

## `set_plan` 合同

- 结构：`{ type: "set_plan", plan_id, plan }`
- `plan_id = null` 表示创建
- `plan_id != null` 表示整体替换该计划
- `plan` 必须包含：
  - `title`
  - `trigger`
  - `task`
  - `priority`
  - `max_runs`
- `plan.task` 与 `enqueue_task.task` 使用同一份任务合同

## `delete_plan` 合同

- 结构：`{ type: "delete_plan", plan_id }`
- 行为：把目标计划标记为 `done(canceled)`，不做物理删除

## 触发机制

- `cron`：按 cron 触发
- `scheduled_at`：一次性触发
- `on_worker_slot_freed`：有空闲 worker 槽位时触发
- plan 触发后统一派发 `enqueue_task` effect，不再存在“只唤醒 manager”的 plan effect

## 运行态回写

- `runtime.runCount`
- `runtime.lastTriggeredAt`
- `runtime.lastTaskId`
- `runtime.closedAt`
- `runtime.doneReason`

这些字段只允许触发执行链路维护，manager action 不直接写入。

## 校验边界

- `scheduled_at` 必须晚于当前时间
- `done` plan 不允许通过 `set_plan` 再次整体替换
- `plan.task` 必须能构出完整任务合同，否则 `set_plan` 直接拒绝

## 示例

```json
{
  "type": "set_plan",
  "plan_id": null,
  "plan": {
    "title": "积压任务续跑",
    "trigger": { "type": "on_worker_slot_freed" },
    "task": {
      "title": "继续处理积压任务",
      "cwd": "/Users/mimiko/Projects/mimikit",
      "mode": "write",
      "goal": "推进积压任务处理",
      "in_scope": ["仅处理当前 focus 的积压项"],
      "out_of_scope": [],
      "done_when": ["输出本轮处理结果与下一步"],
      "context_refs": [],
      "instructions": []
    },
    "priority": "normal",
    "max_runs": 20
  }
}
```

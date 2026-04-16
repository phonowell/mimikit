# 计划（Plan / TaskPlan）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- Plan 主规范覆盖生命周期、触发机制、调度语义与 manager action 合同。它描述 manager 如何把当前推进路径当作假说并运行。
- 计划并不是最高真相源，每轮推进都要在实际 task 与 runtime state 中验证。
- 对应实现主源：`src/policy/manager/action-apply-plan.ts`、`src/policy/manager/action-plan-effect-enqueue.ts`、`src/policy/manager/loop-trigger-plan-execution.ts`

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
- 运行时会把这份任务合同的稳定摘要固化到 `plan.effect.taskContract`，供 manager 在 `state_packet.plans` 中做触发前判断；`taskTemplate` 只保留 enqueue 所需运行字段
- `set_plan(write)` 属于高风险动作，必须由当前用户输入直接授权；runtime 中已有的 active plan / lastTaskId / lane 一致性只用于确认更新是否合法，不用于替代授权。
- 对已有 write plan 的 update，`cwd` / `resourceMode` / `useWorktree` 共同构成 execution lane；只有同 lane 更新才可按对象级授权直接续用，改 lane 时必须从当前用户输入里看到对新 lane 的显式授权。

## `delete_plan` 合同

- 结构：`{ type: "delete_plan", plan_id }`
- 行为：把目标计划标记为 `done(canceled)`，不做物理删除

## 触发机制

- `cron`：按 cron 触发
- `scheduled_at`：一次性触发
- `on_worker_slot_freed`：worker 可用容量出现边沿时触发；启动时若一开始就有空闲容量，会视为一次初始可用边沿，之后只有 `available_slots` 相比上轮增加时才再次触发，不会在持续空闲期间重复触发
- plan 触发后统一派发 `enqueue_task` effect，不再存在“只唤醒 manager”的 plan effect
- `plan.effect` 对 manager 暴露的是调度外壳 + 任务合同 digest，不暴露完整 worker prompt

## 运行态回写

- `runtime.runCount`
- `runtime.lastTriggeredAt`
- `runtime.lastTaskId`
- `runtime.stage = { summary, risk?, needsDecision, sourceTaskId, updatedAt }`
- `runtime.closedAt`
- `runtime.doneReason`

这些字段只允许触发执行链路维护，manager action 不直接写入。

## WebUI / Read Model 投影

- WebUI 中的 plan 不只展示标题与 trigger，还应直接暴露最小必要运行态：
  - `runtime.runCount`
  - `runtime.lastTriggeredAt`
  - `runtime.lastTaskId`
  - `runtime.stage`
  - `runtime.doneReason`
- 这些字段的目标不是把 plan 做成任务板，而是让用户能直接判断：
  - 计划是否仍在推进
  - 最近一次何时触发
  - 最近关联到哪个 task
  - 当前阶段结论 / 当前风险 / 是否待用户拍板
  - 已关闭时为何关闭
- Plan 的展示仍以合同摘要 + 运行态摘要为边界；不得把完整 worker prompt 或过程态噪声重新灌进 WebUI。

## 校验边界

- `scheduled_at` 必须晚于当前时间
- `done` plan 不允许通过 `set_plan` 再次整体替换
- `plan.task` 必须能构出完整任务合同，否则 `set_plan` 直接拒绝
- 低风险 `set_plan(read)` 延续主要依赖 runtime legality；不再接受 continuation anchor、差异解释器或结果旁证作为单独授权层。

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

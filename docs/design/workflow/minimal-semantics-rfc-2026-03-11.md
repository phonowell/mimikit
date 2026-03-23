# 领域模型最小语义 RFC（focus / plan / task / action / memory）

- status: implemented
- date: 2026-03-11; updated: 2026-03-23
- scope: `focus`、`plan`、`task`、`action`、`memory`
- source:
  - `docs/todo/mimikit-rearchitecture-final-plan.md`
  - `docs/design/workflow/focus.md`
  - `docs/design/workflow/plan.md`
  - `docs/design/workflow/task.md`
  - `docs/design/workflow/action.md`
  - `docs/design/workflow/memory.md`
  - `src/focus/*`
  - `src/manager/action-*`
  - `src/orchestrator/*`
  - `src/memory/*`
  - `src/storage/runtime-snapshot-schema.ts`

> 历史 RFC；当前可执行规范以 `docs/design/workflow/*.md` 与对应 `src/*` 实现为准。

## 0. 2026-03-23 落地状态

核心收敛项均已落地：`TaskPlan=trigger+effect+runtime`、`Task` 不再承载调度字段、`focus.summary/openItems` 降级为 digest、`memory refresh` 收窄为 `signals`、`Task.git.lifecycle` 入模、低上下文 wake profile 不再开放 `lookup`。本文以下内容只保留为设计背景。

## 1. 背景

当前仓库已经把 `focus / plan / task / action / memory` 五个对象分别落了文档和实现，但它们仍然存在两类不收敛：

1. 同一语义被多个对象同时承载。
2. 某些对象同时混入“定义 + 运行时 bookkeeping + UI 摘要 + 调度策略”。

其中最明显的是 `plan`：

- 它既像触发器，又像自由文本指令容器。
- 它既承载触发条件，又夹带调度来源、运行计数、最近任务关联等派生状态。
- 触发后实际仍依赖 manager 读取 `prompt` 再决定做什么，导致“plan 是 trigger 还是 intent container”并不清楚。

在 RFC 提出时，`Task` 仍保留 `cron / scheduledAt`，`focus.summary/openItems` 容易被误用成 task list，`memory` 刷新链路也仍可能吸收过程态文本。本节保留的是当时背景，而不是当前仓库事实。

本 RFC 的目标不是引入新概念，而是把现有概念压回最小必要语义。

## 2. 收敛结论

推荐把五个对象收敛成下面这套最小语义：

### 2.1 `focus`

`focus` 是工作线主键，不是计划容器，不是记忆容器，也不是任务拆解容器。

保留职责：

- 给 `task`、`plan`、`history` 提供唯一归属。
- 提供当前工作线的人类可读标题。
- 提供轻量 digest：`summary` 与 `openItems` 只用于连续性展示与路由提示。

不做项：

- 不承载执行步骤。
- 不承载长期事实。
- 不承载触发策略。
- 不承载任务验收标准。

边界约束：

- `focus.summary/openItems` 是 digest，不是 source of truth。
- 一旦需要“必须执行/必须验收”的内容，应进入 `task.contract` 或 task archive，而不是堆进 `focus`。

### 2.2 `task`

`task` 是唯一执行单元，也是唯一对“完成/失败/部分完成”负责的对象。

保留职责：

- 描述一次实际执行：`prompt/title/cwd/provider/profile`。
- 持有执行契约：`contract`。
- 持有执行结果：`result`。
- 持有证据：`result.evidence` / `archivePath` / `handoff`。
- 持有恢复所需的 session/runtime 元数据。

不做项：

- 不负责长期重复触发。
- 不负责定义工作线摘要。
- 不负责维护长期事实记忆。

边界约束：

- `task` 一旦入队，就应该代表“一个待执行或已执行实例”。
- 调度属于 `plan`；执行实例属于 `task`。
- 因此 `Task.cron` / `Task.scheduledAt` 属于明显的语义泄漏，应该从长期模型中移除。

### 2.3 `plan`

`plan` 只是一条可审计、可暂停、可恢复的触发规则；它不应再是复杂语义容器。

保留职责：

- 定义何时触发：`trigger`。
- 定义触发后要执行哪类受控 effect。
- 记录最小必要 bookkeeping：`runCount`、`lastTriggeredAt`、`lastTaskId`。

不做项：

- 不保存开放式工作意图解释。
- 不保存长期上下文摘要。
- 不直接承担执行结果语义。
- 不承载 UI 以外的来源叙事字段。

边界约束：

- `plan` 必须强绑定 `focusId`。
- `plan` 不直接生成“已完成”结论；完成结论来自被它触发的 `task` 结果或显式关闭动作。
- `plan` 只负责“再触发”，不负责“解释执行得好不好”。

### 2.4 `action`

`action` 是 manager 与 runtime 之间的短生命周期协议，不是业务一等对象。

保留职责：

- 表达当前轮次要执行的结构化操作。
- 做 schema 校验、surface 控制和 apply。
- 产出状态变更入口。

不做项：

- 不承担持久业务状态。
- 不作为审计真相源。
- 不保存长期连续性。

边界约束：

- 需要持久化的不是 action 本身，而是 action 造成的状态变化与 system event。
- action 可以作用于 `focus / plan / task / memory`，但不拥有它们。

### 2.5 `memory`

`memory` 只保留长期事实，不承担调度，不承担过程编排，也不承担工作线摘要。

保留职责：

- 存放跨轮次仍有价值的事实、偏好、约束、稳定结论。
- 根据评分器注入 prompt。
- 通过 refresh 做合并、压缩、删除。

不做项：

- 不保存“待办列表”。
- 不保存触发策略。
- 不保存瞬时执行状态。
- 不保存 task contract 的逐条拆解。

边界约束：

- `focusHints` 只能是检索提示，不是 ownership。
- 任何需要强归属、强可追责的内容，都不应只存在于 memory。

## 3. 依赖方向

推荐的依赖方向如下：

- `focus`：被引用，不主动依赖 `plan/task/memory` 语义。
- `plan -> focus`：每个 plan 必须归属到一个 focus。
- `plan -> task template/effect`：plan 只知道“触发什么”，不知道“执行结果如何评价”。
- `task -> focus`：每个 task 必须归属到一个 focus。
- `task -> evidence/archive`：task 是结果和证据的唯一生产者。
- `memory -> focusHints`：仅弱提示，不建立所有权。
- `action -> focus/plan/task/memory`：只发起变更，不拥有状态。

一句话版本：

- `focus` 定归属。
- `plan` 定触发。
- `task` 定执行与证据。
- `action` 定当轮操作。
- `memory` 定长期事实。

## 4. `plan` 收敛方案

### 4.1 现状问题

当前 `TaskPlan` 至少混了四层语义：

1. 触发层：`trigger`、`maxRuns`。
2. 意图层：`prompt`、`title`。
3. 运行态 bookkeeping：`runCount`、`lastTriggeredAt`、`lastTaskId`、`archivedAt`。
4. UI/来源层：`source`、固定 `profile`。

它的问题不是字段多，而是这些字段拼在一起后，`plan` 看起来像“半个 task + 半个 manager prompt + 半个 trigger state”。

更严重的是，当前 `plan.prompt` 是自由文本；plan 触发后到底是：

- 重新创建 task，还是
- 只提醒 manager 看一下，还是
- 去改 focus/memory，

需要 manager 再解释一次。这会让 plan 重新回到“复杂语义容器”。

### 4.2 候选方案

#### 方案 A：维持现有 `TaskPlan`，只补文档约束

优点：

- 改动最小。
- 无需迁移数据结构。

缺点：

- 自由文本 `prompt` 仍在。
- `Task.cron/scheduledAt` 与 `plan.trigger` 的边界仍模糊。
- 收敛主要依赖人类自觉，不够稳。

#### 方案 B：把 `plan` 改成 `trigger + effect`

优点：

- 触发层与执行层边界清晰。
- 能把 plan 从自由文本容器压回受控对象。
- 迁移成本可控，且符合当前仓库已有 schema-first 方向。

缺点：

- 需要一次性调整 action/schema/runtime snapshot。
- 旧 plan 需要迁移。

#### 方案 C：取消 plan 一等对象，把 trigger 直接挂到 task/focus

优点：

- 理论上最简。

缺点：

- 目前仓库已有独立 plan UI、排序、调度与回写链路。
- 一步到位成本过高，容易把现有可审计性一起打碎。

推荐：采用方案 B。

### 4.3 推荐数据结构

建议把 `TaskPlan` 收敛为：

```ts
export type PlanEffect =
  | {
      kind: 'enqueue_task'
      taskTemplate: {
        title: string
        prompt: string
        cwd: string
        provider?: 'codex'
        contract: {
          goal: string
          scope: string
          acceptance: string[]
          outOfScope?: string
          contextRefs?: string[]
        }
      }
    }
  | {
      kind: 'wake_manager'
      reason: 'scheduled_review' | 'capacity_retry' | 'follow_up'
    }

export type TriggerPlan = {
  id: string
  focusId: string
  title: string
  status: 'active' | 'blocked' | 'done'
  trigger:
    | { mode: 'cron'; cron: string }
    | { mode: 'scheduled_at'; scheduledAt: string }
    | { mode: 'on_worker_slot_freed' }
  effect: PlanEffect
  priority: 'high' | 'normal' | 'low'
  maxRuns?: number
  runCount: number
  lastTriggeredAt?: string
  lastTaskId?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  doneReason?: 'completed' | 'exhausted' | 'canceled'
}
```

关键点：

- `plan` 不再在顶层保存自由文本 `prompt`。
- 需要派发 task 时，使用结构化 `taskTemplate`。
- 只想唤醒 manager 做一次检查时，使用受限的 `wake_manager.reason`，而不是任意 prompt。
- `profile` 从 plan 中删除；当前实现只有固定 `worker`，属于冗余字段。
- `source` 从 plan 主体删除；若仍需审计来源，应进入 system event payload，而不是长期挂在领域对象上。
- `lastCompletedAt` 可以删除；它是 `lastTaskId` 结果的派生视图，不必单独占一个主字段。
- `archivedAt` 建议并入 `closedAt`，避免“done + archived”双重终态语义。

注：当前实现已按这个方向落到 `plan.runtime.runCount/lastTriggeredAt/lastTaskId/closedAt/doneReason`，不再保留顶层 bookkeeping 字段。

### 4.4 对外 action API 建议

建议把 `create_plan` / `update_plan` 也同步收敛到 effect 结构：

```xml
<M:create_plan
  title="每日回顾"
  focus_id="focus-mimikit"
  trigger_mode="cron"
  cron="0 9 * * *"
  effect_kind="wake_manager"
  effect_reason="scheduled_review"
/>
```

```xml
<M:create_plan
  title="空槽位续跑"
  focus_id="focus-mimikit"
  trigger_mode="on_worker_slot_freed"
  max_runs="20"
  effect_kind="enqueue_task"
  task_title="继续收敛领域模型"
  task_prompt="阅读最新状态并推进 RFC 收敛"
  task_cwd="/Users/mimiko/Projects/mimikit"
  task_goal="推进领域模型收敛"
  task_scope="仅处理 focus/plan/task/action/memory 边界"
  task_acceptance_1="输出一版新的 RFC 或收敛结论"
/>
```

这样 `plan` 触发什么在 schema 层就确定了，不再靠 manager 读自由文本二次解释。

## 5. 字段删减 / 迁移建议

本节多数项目已完成；保留它主要是为了说明当前协议为何收敛成现状。

| 当前字段 | 处理 | 理由 |
| --- | --- | --- |
| `TaskPlan.prompt` | 移入 `effect.taskTemplate.prompt` 或删除 | 顶层自由文本会把 plan 重新变成语义容器 |
| `TaskPlan.profile` | 删除 | 当前恒为 `worker`，无信息增量 |
| `TaskPlan.source` | 移到 event payload | 审计信息不应污染核心对象 |
| `TaskPlan.lastCompletedAt` | 删除 | 可由 `lastTaskId` 对应 result 推导 |
| `TaskPlan.archivedAt` | 改为 `closedAt` | 终态时间只保留一个字段 |
| `Task.cron` | 删除 | 调度属于 plan，不属于 task 实例 |
| `Task.scheduledAt` | 删除 | 调度属于 plan，不属于 task 实例 |
| `FocusDigest.openItems` | 保留但降级为 digest | 仅用于提示，不作为任务真相源 |
| `MemoryEntry.focusHints` | 保留 | 仅检索提示，继续禁止升级为 ownership |

补充建议：

- 给 `plan`、`task` 增加显式 `schemaVersion`，而不是继续依赖隐式字段组合。
- `task` 若需要保留“由谁触发”的信息，应新增 `triggeredByPlanId` 或 `triggerMeta`，不要继续复用 `cron/scheduledAt`。

## 6. 迁移策略

以下迁移策略已基本完成；现阶段不再建议重新引入任何兼容层或双 schema 并存。

### 6.1 推荐迁移顺序

1. 先写 RFC，并冻结语义目标。
2. 调整 `create_plan/update_plan` schema 与 runtime snapshot schema。
3. 一次性迁移已有 `runtime.taskPlans`。
4. 删除 `Task.cron/scheduledAt`，改为 `triggeredByPlanId` 或等价元信息。
5. 更新 prompt payload / read model / WebUI 展示。
6. 清理旧文档与测试。

### 6.2 一次性迁移规则

对现有 plan，建议只允许两种迁移输出：

1. 明确可判定为“定时创建 task”的，迁到 `effect.kind='enqueue_task'`。
2. 无法结构化判定的，迁到 `effect.kind='wake_manager'` 且标记 `reason='follow_up'`，同时把该 plan 置为 `blocked`，要求人工确认后再恢复。

这样做的目的不是保留兼容层，而是避免把旧自由文本 prompt 静默带进新模型。

### 6.3 兼容策略

这里的“兼容”建议是一次性迁移兼容，不是长期运行时兼容：

- 不建议长期支持 `old TaskPlan + new TriggerPlan` 双 schema 并存。
- 不建议 dual-write。
- 不建议在 apply/runtime/prompt 三条链路里长期保留 legacy if-else。

推荐做法：

- 提供一次性迁移脚本或启动前重写工具。
- 迁移完成后，旧 snapshot 直接拒绝加载。
- 文档、schema、WebUI、prompt 同步切到新语义。

这与仓库“全量更新、不留兼容层”的原则一致。

## 7. 当前状态

原“最小落地建议”已完成；现在只剩三条持续约束：

- 不重新引入旧 `TaskPlan.prompt` 式自由文本 plan 容器
- 不把 `focus.openItems` 扩成正式任务列表
- 不把 `memory` 再扩成 process log 或 queue scratchpad

## 8. 验收标准

当以下条件同时满足时，可以认为领域模型已进入稳定收敛状态：

- `focus` 只承担归属与 digest，不再承载执行规划。
- `task` 成为唯一执行实例与证据载体。
- `plan` 只表达 `trigger + effect`，不再依赖自由文本解释。
- `action` 只作为协议层，不再被当作持久业务对象。
- `memory` 只保留长期事实，不再侵入调度与过程状态。
- `Task.cron/scheduledAt` 从核心模型中消失。
- 旧 `TaskPlan` 通过一次性迁移完成切换，无长期兼容分支。

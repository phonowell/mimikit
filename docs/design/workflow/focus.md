# 焦点（Focus）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- Focus 是编排域里用来隔离工作线（workline）归属的单元，它保证多条线之间的运行与状态隔离。
- Focus 不是任务板，也不承载执行步骤、验收标准或恢复指令；初次创建的 task/plan/history 会根据当前活跃 focus 候选自动归属，显式变更归属只能通过 `assign_focus`。
- 对应实现主源：`src/work/focus/*`、`src/policy/manager/action-apply-focus.ts`

## 核心原则

- Focus 只负责归属与容量治理，确保工作线之间不会串线；任务板语义不能放到 focus 或 summary 上。
- `focus.summary / openItems` 不是执行清单、验收标准或恢复指令。
- manager 不再保留 `upsert_focus` 一类直接编辑 focus 文本状态的 action。

## 保留 Action

- `assign_focus`
  - `target_type = task | plan | history`
  - `target_id`
  - `focus_id`

## 保留 ID

- `focus-global`
- `focus-inbox`

## 默认归属

- 新任务、计划与历史条目会优先归属到最近活跃的业务 focus。
- 若无活跃 focus，则复用最近可用的 idle focus，仍无则退回 `focus-inbox`。

## 归属变更

- `assign_focus` 是改变已存在 task/plan/history focusId 的唯一 action；它只在默认归属不能满足隔离需求时触发。
- manager 不再提供 `upsert_focus` 等直接编辑 focus 内容的 action，focus 的状态由持久化真相源主导，assign_focus 只负责归属迁移。

## 容量治理

- `active` 业务 focus 数量受 worker 并发上限约束
- 超限时按 `lastActivityAt` 做 LRU 降级
- `archived` focus 不进入常规工作视图

## 结果回写

- task / plan / history 的 `focusId` 是唯一真相源
- task 结果会更新 focus 活跃度，但不会再自动生成 `openItems`
- 需要改变归属时，用 `assign_focus`；不要把 focus 当轻量任务板使用

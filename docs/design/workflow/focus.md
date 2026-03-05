# 焦点（Focus）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- 主键：`focus_id`（示例：`focus-release-plan`）
- 系统保留：`focus-global`（系统事件）与 `focus-inbox`（业务默认兜底）
- 状态：`active | idle | done | archived`
- 保留约束：`focus-global` 固定 `active`；`focus-inbox` 固定可复用（不进入 `done/archived`）
- `active` 上限：`worker.maxConcurrent`
- `archived` 保留上限：`2 * worker.maxConcurrent`
- 淘汰策略：按 `lastActivityAt` 的 LRU

## 归属规则

- 每条 `UserInput/HistoryMessage/Task/TaskPlan` 必带 `focusId`
- 业务默认归属优先选择最近 `active` 非 global focus；若无则复用最近 `idle` 非 global focus；再无则落到 `focus-inbox`
- `focus-global` 仅用于系统级事件默认归属（如 startup/idle/worker_slot_freed/manager_error）
- `upsert_focus`：按 `id` 创建或更新 focus 元信息与上下文摘要
- `assign_focus`：按 `target_type + target_id` 归属（`task | plan | history`）

## Prompt 注入

- Manager：`M:focus_list`、`M:focus_contexts`
- Worker：`M:focus_context`（当前任务相关 focus 摘要）

## 关联数据结构

定义：`src/types/index.ts`

- `FocusMeta`
- `FocusContext`

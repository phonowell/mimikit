# 焦点（Focus）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- 主键：`focus_id`（示例：`focus-release-plan`）
- 状态：`active | idle | done | archived`
- `active` 上限：`worker.maxConcurrent`
- `archived` 保留上限：`2 * worker.maxConcurrent`
- 淘汰策略：按 `lastActivityAt` 的 LRU

## 归属规则

- 每条 `UserInput/HistoryMessage/Task/TaskPlan` 必带 `focusId`
- `upsert_focus`：按 `id` 创建或更新 focus 元信息与上下文摘要
- `assign_focus`：按 `target_type + target_id` 归属（`task | plan | history`）

## Prompt 注入

- Manager：`M:focus_list`、`M:focus_contexts`
- Worker：`M:focus_context`（当前任务相关 focus 摘要）

## 关联数据结构

定义：`src/types/index.ts`

- `FocusMeta`
- `FocusContext`

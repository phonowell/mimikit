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
- `assign_focus`：将输入/任务/结果归属到指定 focus

## Prompt 注入

- `M:focus_list`
- `M:focus_contexts`

## 关联数据结构

定义：`src/types/index.ts`

- `FocusMeta`
- `FocusContext`

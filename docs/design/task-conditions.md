# 条件与时间语义

> 返回 [任务系统概览](./task-system.md)

## 条件类型
```jsonc
{ "type": "file_changed",  "params": { "path": "string", "fireOnInit": false } }
{ "type": "task_done",     "params": { "taskId": "string" } }
{ "type": "task_failed",   "params": { "taskId": "string" } }
{ "type": "file_exists",   "params": { "path": "string" } }
{ "type": "llm_eval",      "params": { "prompt": "string" } }
```

组合条件（`and` / `or`）支持嵌套。

## 评估规则
- `AND` / `OR` 短路求值。
- `file_changed`：比较当前 mtime 与 `state.lastMtime`；首次仅初始化基线（除非 `fireOnInit=true`）。
- `task_done` / `task_failed`：读取 `task_status.json`，若状态匹配且 `state.lastSeenResultId` 不同，则触发并更新 `lastSeenResultId`。
- `llm_eval`：按批量 Worker 评估，结果由 Supervisor 消费，不唤醒 Teller。
- 冷却期：命中后写入 `lastTriggeredAt`，`cooldown` 期间不再触发。

## 时间语义
- 所有时间戳使用 **UTC ISO 8601**（如 `2026-01-31T12:34:56.789Z`）。
- 触发器调度以 `schedule.nextRunAt` 为准；缺失时按 `lastRunAt + interval` 或 `createdAt + interval` 推导。
- `recurring`：当 `now >= nextRunAt` 时触发一次，随后设置 `lastRunAt=now`、`nextRunAt=now+interval`（不补跑累计次数）。
- `scheduled`：若 `now >= runAt`，在下一轮立即触发并移除。
- 冷却期基于 `lastTriggeredAt`（UTC）判断。

## 任务串联
- Planner 拆分复杂请求时，用 `task_done` 串联 oneshot 子任务（A 完成 → 触发 B）。
- 子任务继承同一 `traceId`，并用 `parentTaskId` 指向上游任务。

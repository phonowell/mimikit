# 任务数据结构

> 返回 [任务系统概览](./task-system.md)

## Task（内存）
```jsonc
{
  "id": "task-001",
  "prompt": "...",
  "status": "pending|done",
  "createdAt": "2026-02-02T12:00:00.000Z"
}
```

## TaskResult（内存）
```jsonc
{
  "taskId": "task-001",
  "status": "done",
  "ok": true,
  "output": "...",
  "durationMs": 12345,
  "completedAt": "2026-02-02T12:34:56.789Z"
}
```

## 说明
- 任务与结果均在内存，未持久化。
- 结果由 Worker 回传给 Manager，用于生成用户回复。

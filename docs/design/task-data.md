# 任务数据结构

> 返回 [任务系统概览](./task-system.md)

## Task（内存）
```jsonc
{
  "id": "task-001",
  "prompt": "...",
  "title": "简短标题",
  "status": "pending|running|succeeded|failed|canceled",
  "createdAt": "2026-02-02T12:00:00.000Z"
}
```

## TaskResult（内存）
```jsonc
{
  "taskId": "task-001",
  "status": "succeeded|failed|canceled",
  "ok": true,
  "output": "...",
  "durationMs": 12345,
  "completedAt": "2026-02-02T12:34:56.789Z",
  "usage": { "input": 123, "output": 456, "total": 579 },
  "archivePath": ".mimikit/results/2026-02-02/task-001_short-title.md"
}
```

## 说明
- 任务仍在内存，结果会落盘到 .mimikit/results/YYYY-MM-DD/。
- 结果由 Worker 回传给 Manager，用于生成用户回复，同时写入归档文件。

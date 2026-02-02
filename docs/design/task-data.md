# 任务数据结构

> 返回 [任务系统概览](./task-system.md)

## Task（agent-queue/*.json）
```jsonc
{
  "id": "task-001",
  "prompt": "...",
  "priority": 5,
  "status": "queued|running|done|failed|cancelled|timeout",
  "createdAt": "2026-02-02T12:00:00.000Z",
  "blockedBy": ["task-000"],
  "scheduledAt": "2026-02-02T13:00:00.000Z"
}
```

## TaskResult（agent-results/*.json）
```jsonc
{
  "taskId": "task-001",
  "status": "done|failed|timeout",
  "output": "...",
  "durationMs": 12345,
  "completedAt": "2026-02-02T12:34:56.789Z"
}
```

## 说明
- 任务状态与结果分离；Thinker 消费结果后会删除结果文件。
- 依赖与定时仅由 Worker 侧调度判断。

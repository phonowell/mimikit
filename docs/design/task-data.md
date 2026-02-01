# 任务数据结构

> 返回 [任务系统概览](./task-system.md)

## 执行任务（Run / oneshot）
- 存放：worker/queue | running | results
- attempts 语义：入队=0，开始执行=1，重试在重新入队前递增

```jsonc
{
  "id": "task-001",
  "type": "oneshot",
  "traceId": "trace-001",
  "parentTaskId": "planner-001",
  "prompt": "...",
  "priority": 5,
  "createdAt": "...",
  "attempts": 0,
  "timeout": null,
  "sourceTriggerId": "trigger-001",
  "triggeredAt": "..."
}
```

## 触发器（Trigger）
- 存放：triggers/
- type：recurring | scheduled | conditional
- schedule：recurring 用 interval/lastRunAt/nextRunAt；scheduled 用 runAt
- state 字段按条件类型使用，未使用字段可省略
- id 全局唯一；traceId 用于链路追踪

```jsonc
{
  "id": "trigger-001",
  "type": "recurring|scheduled|conditional",
  "traceId": "trace-001",
  "parentTaskId": "task-001",
  "prompt": "...",
  "priority": 5,
  "createdAt": "...",
  "timeout": null,
  "schedule": { "interval": 21600, "lastRunAt": null, "nextRunAt": null },
  "condition": { "type": "file_changed", "params": { "path": "src/**/*.ts" } },
  "cooldown": 3600,
  "state": {
    "lastTriggeredAt": null,
    "lastEvalAt": null,
    "lastSeenResultId": null,
    "lastMtime": null,
    "initialized": false
  }
}
```

## Worker 结果（终态）
```jsonc
{
  "id": "task-001",
  "status": "done|failed",
  "resultType": "text|code_change|analysis|summary",
  "result": { ... },
  "error": "...",
  "failureReason": "timeout|error|killed",
  "attempts": 1,
  "traceId": "trace-001",
  "sourceTriggerId": "trigger-001",
  "startedAt": "...",
  "completedAt": "...",
  "durationMs": 12345
}
```

## Planner 结果
- status=done → tasks 列出子任务/触发器定义（由 Supervisor 入队）
- status=needs_input → question/options/default 交给 Teller 发问
- status=failed → Teller 汇报（不自动重试）
- needs_input 仅存在于 planner/results/，不写入 task_status.json

## task_status.json（终态索引）
```jsonc
{
  "id": "task-001",
  "status": "done|failed",
  "completedAt": "...",
  "resultId": "task-001",
  "sourceTriggerId": "trigger-001",
  "failureReason": "timeout|error|killed",
  "traceId": "trace-001"
}
```

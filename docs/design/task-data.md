# 任务数据结构

> 返回 [任务系统概览](./task-system.md)

## 执行任务（Run / oneshot）
- 存放：worker/queue | running | results
- attempts 语义：入队=0，开始执行=1，重试在重新入队前递增
- schemaVersion：结构版本号，缺省视为 v1（运行时自动迁移为 v2）
- deferUntil：延迟执行时间（UTC ISO 8601），未到时间不会被调度

```jsonc
{
  "schemaVersion": 2,
  "id": "task-001",
  "type": "oneshot",
  "traceId": "trace-001",
  "parentTaskId": "planner-001",
  "prompt": "...",
  "priority": 5,
  "createdAt": "...",
  "attempts": 0,
  "timeout": null,
  "deferUntil": null,
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
- state.nextRunAt 用于 Supervisor 计算下一次唤醒时间

```jsonc
{
  "schemaVersion": 2,
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
    "initialized": false,
    "runningAt": null,
    "lastStatus": null,
    "lastError": null,
    "lastDurationMs": null,
    "nextRunAt": null
  }
}
```

## Worker 结果（终态）
结果包含任务快照（task），用于重试与审计；不作为新的执行输入。
```jsonc
{
  "schemaVersion": 2,
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
  "durationMs": 12345,
  "task": {
    "prompt": "...",
    "priority": 5,
    "createdAt": "...",
    "timeout": null,
    "traceId": "trace-001",
    "parentTaskId": "planner-001",
    "sourceTriggerId": "trigger-001",
    "triggeredAt": "..."
  }
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
  "schemaVersion": 2,
  "id": "task-001",
  "status": "done|failed",
  "completedAt": "...",
  "resultId": "task-001",
  "sourceTriggerId": "trigger-001",
  "failureReason": "timeout|error|killed",
  "traceId": "trace-001"
}
```

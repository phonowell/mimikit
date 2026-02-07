# 任务数据结构

> 返回 [任务系统概览](./task-system.md)

## Task（内存）
```jsonc
{
  "id": "task-001",
  "fingerprint": "normalized-prompt",
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
  "output": "给 manager/tasks 使用的摘要版本（可能短于归档原文）",
  "durationMs": 12345,
  "completedAt": "2026-02-02T12:34:56.789Z",
  "usage": { "input": 123, "output": 456, "total": 579 },
  "archivePath": ".mimikit/tasks/2026-02-02/task-001_short-title.md"
}
```

## 说明
- 任务在内存中调度；`pending/running` 会快照到 `.mimikit/runtime-state.json`，重启可恢复（`running` 恢复为 `pending`）。
- 任务结果会落盘到 `.mimikit/tasks/YYYY-MM-DD/`。
- Worker 回传的是详细结果；Manager 在消费 `pendingResults` 时可改写为摘要并写入 `task.result`。
- 摘要优先级：先使用 `@summarize_result` 的显式摘要；若缺失则使用本地兜底摘要（压缩空白 + 长度截断）。
- 归档文件始终保留 Worker 原始详细版本，不受摘要改写影响。
- 创建任务时会基于 prompt 生成 fingerprint；若存在同 fingerprint 的 pending/running 任务则不重复创建。

# 数据结构

> 返回 [系统设计总览](./README.md)

## Task
- 关键字段：`id`、`prompt`、`title`、`profile`、`status`。
- `profile`：`standard | expert`。
- 运行字段：`startedAt`、`completedAt`、`durationMs`、`attempts`。

## TaskResult
- 关键字段：`taskId`、`status`、`output`、`durationMs`、`completedAt`。
- 可选字段：`usage`、`archivePath`、`profile`。

## 通道载荷
- `user-input`：`UserInput`。
- `worker-result`：`TaskResult`。
- `teller-digest`：`TellerDigest`（含 `taskSummary`）。
- `thinker-decision`：`ThinkerDecision`（含 `decision` 与 `inputIds`）。

定义位置：`src/contracts/channels.ts`、`src/types/index.ts`。

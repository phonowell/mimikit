# 数据结构（当前实现）

> 返回 [系统设计总览](./README.md)

## 核心类型
- 定义文件：`src/types/index.ts`

## UserInput
- 字段：`id`、`text`、`createdAt`、`quote?`
- 写入：`inputs/packets.jsonl`

## Task
- 字段：`id`、`fingerprint`、`prompt`、`title`、`profile`、`status`
- 运行字段：`startedAt?`、`completedAt?`、`durationMs?`、`attempts?`
- profile：`standard | specialist`

## TaskResult
- 字段：`taskId`、`status`、`ok`、`output`、`durationMs`、`completedAt`
- 可选：`usage`、`title`、`archivePath`、`profile`
- 写入：`results/packets.jsonl`

## HistoryMessage
- 字段：`id`、`role(user|assistant|system)`、`text`、`createdAt`
- 可选：`usage`、`elapsedMs`、`quote`
- 写入：`history.jsonl`

## Queue Packet
- 结构：`{ id, createdAt, payload }`
- `inputs/results` 都使用统一 packet 包装。

# 任务系统概览

> 返回 [系统设计总览](./README.md)

## 生命周期（高层）
```
用户输入 → Manager 回复 + 可能派发任务
  ↓
内存任务队列（pending）
  ↓
Worker 执行
  ↓
结果回传 → Manager 告知用户（同时写入 tasks 归档）
```

注：`pendingInputs` 与 `pendingResults` 仅在 Manager 消费时写入 `history.jsonl`，避免预写后再去重。

## 调度规则
- 仅处理 `status=pending` 的任务。
- FIFO：按创建顺序执行。
- 任务创建去重：若已有同 fingerprint 的 `pending/running` 任务，则复用现有任务，不重复创建。

## 关键规则
- Worker 不派发新任务、不与用户对话。
- Manager 通过 MIMIKIT 命令派发任务。
- Worker 内建最小自动重试（默认 1 次），减少瞬时失败人工干预。
- 受每日 token 预算闸门约束，预算用尽时暂停新任务进入执行。
- 结果落盘：.mimikit/tasks/YYYY-MM-DD/

## 相关文档
- 任务结构：docs/design/task-data.md
- 命令协议：docs/design/commands.md

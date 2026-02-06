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
结果回传 → Manager 告知用户（同时写入 results 归档）
```

## 调度规则
- 仅处理 `status=pending` 的任务。
- FIFO：按创建顺序执行。
- 任务创建去重：若已有同 fingerprint 的 `pending/running` 任务，则复用现有任务，不重复创建。

## 关键规则
- Worker 不派发新任务、不与用户对话。
- Manager 通过 MIMIKIT 命令派发任务。
- 无内建重试；需要重试由 Manager 重新派发。
- 结果落盘：.mimikit/results/YYYY-MM-DD/

## 相关文档
- 任务结构：docs/design/task-data.md
- 命令协议：docs/design/commands.md

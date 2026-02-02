# 任务系统概览

> 返回 [系统设计总览](./README.md)

## 生命周期（高层）
```
用户输入 → Teller 回复 + 记录输入
  ↓
Thinker 苏醒 → 解析输入/结果 → 派发任务/通知
  ↓
agent-queue/ 任务执行（Worker）
  ↓
agent-results/ 结果生成
  ↓
Thinker 消费结果 → notify_teller
```

## 调度规则
- 仅处理 `status=queued` 的任务。
- 依赖：`blockedBy` 全部完成后才可运行。
- 定时：`scheduledAt` 未到期不执行。
- 优先级：`priority` 数值越大越先执行；同优先级按 `createdAt` 先后。

## 关键规则
- Worker 不派发新任务、不与用户对话。
- Thinker 通过 MIMIKIT 命令派发/取消/更新任务。
- 无内建重试；需要重试由 Thinker 重新派发。

## 相关文档
- 任务结构：docs/design/task-data.md
- 命令协议：docs/design/commands.md

# 任务（Task）

> 返回 [Workflow 索引](./task-and-action.md)

## 生命周期

- `pending`：manager 已派发，等待外部执行。
- `running`：worker 正在调度外部执行。
- `succeeded | failed | canceled`：终态。

## 派发与去重

- 立即执行 Action：`<M:run_task ... />`
- worker 任务 profile 固定为 `worker`
- action 去重键：`prompt + title + profile + focusId`
- queue 去重键：`task.fingerprint`（仅拦 active 任务）

## 执行编排与回写

1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 调用外部执行运行时并收敛错误。
3. `finalizeResult` 更新任务状态并归档。
4. 发布到 `results`，立即唤醒 manager 消费结果。
5. `pending` 快速取消：发布 `canceled` 到 `results`，立即唤醒 manager。

## 取消与恢复

- `pending` 取消：立即标记并发布 `canceled`。
- `running` 取消：触发 `AbortController`，由外部执行链路收敛到 `canceled`。
- 启动恢复：持久化时 `running` 降级为 `pending`，重启后重入队列。
- session 恢复：worker 记录并持久化 `task.sessionId`；重试/重启恢复优先复用。`cancel.source=user` 视为不可恢复并丢弃 session，`deferred/system` 视为可恢复并保留 session（若存在）。

### session 复用/丢弃语义

| 条件 | 行为 | 关键实现 |
| --- | --- | --- |
| 任务重试或进程重启恢复，且 `task.sessionId` 存在、`sessionState!=discarded`、`cancel.source!=user` | 复用旧 session | `src/worker/session-state.ts#selectReusableSessionId` + `src/worker/run-retry.ts` |
| provider 返回 resume/thread/session 无效类错误（not found/expired/invalid） | 丢弃旧 session，下一次尝试不带 `sessionId` | `src/worker/session-state.ts#shouldResetSessionAfterError` + `src/worker/run-retry.ts#onSessionDiscarded` |
| 用户主动取消（HTTP/显式用户来源） | 立即丢弃旧 session，后续必须新建 | `src/worker/cancel-task.ts#applyCancelSessionPolicy`（`source=user`） |
| 系统取消或延后取消（`source=system/deferred`） | 保留旧 session 为可恢复 | `src/worker/cancel-task.ts#applyCancelSessionPolicy`（`source=system/deferred`） |

`cancel.source` 归一化规则：`user|http -> user`，`deferred -> deferred`，其他来源统一视为 `system`（见 `src/worker/cancel-task.ts#normalizeCancelSource`）。

### 本地验证步骤（最小复现）

1. 异常中断/恢复复用旧 session：`pnpm vitest run test/runtime-persistence-queue-reconcile.test.ts -t "persist+hydrate keeps reusable session on recovered pending task" && pnpm vitest run test/worker-run-retry-session.test.ts -t "reuses persisted session id on next attempt"`  
   观察点：恢复后任务从 `running` 降级为 `pending` 且保留 `sessionId`；下一次 worker 调用携带旧 `sessionId`。
2. 用户取消丢弃旧 session、系统延后取消保留旧 session：`pnpm vitest run test/worker-cancel-session-policy.test.ts`  
   观察点：`source=user` 后 `task.sessionId` 被清除且 `sessionState=discarded`；`source=deferred` 保留 `sessionId` 且 `sessionState=reusable`。
3. 全量门禁：`pnpm run review-code-changes`  
   观察点：lint/type-check/test 全部通过后再执行 `wt-land`。

### 常见问题排查（持久化状态清理）

1. 停止运行中的进程，避免被后台循环立刻重写状态文件。
2. 清理 `.mimikit/runtime-snapshot.json` 与 `.mimikit/runtime-snapshot.json.bak`（或对应 `workDir` 下同名文件）。
3. 如需同时清空队列游标副作用，额外清理 `.mimikit/inputs/*.jsonl`、`.mimikit/results/*.jsonl` 后再重启。
4. 重启后检查首条 `runtime_hydrated` 日志与任务状态，确认恢复来源为预期快照。

## 关联数据结构

定义：`src/types/index.ts`

- `Task`

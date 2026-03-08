# 任务（Task）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- 本文档是 Task 领域的单一主规范（single source of truth），覆盖生命周期、派发去重、执行回写、取消恢复与 session 语义。
- 涉及 Task 的设计记录、提案、讨论稿仅作背景参考，不构成并行规范。
- 若与其他文档表述冲突，以本文档与对应实现代码（`src/worker/*`、`src/manager/*`）为准。

## 生命周期

- `pending`：manager 已派发，等待外部执行。
- `paused`：任务被用户暂停，等待恢复。
- `running`：worker 正在调度外部执行。
- `succeeded | failed | canceled`：终态。

## 派发与去重

- 立即执行 Action：`<M:enqueue_task ... />`
- 生命周期控制 Action：`<M:mutate_task id="task-..." op="pause|resume|cancel" />`
- worker 任务 profile 固定为 `worker`
- 单轮 action 去重键：`prompt + title + profile + provider + focusId + contract`
- active 任务去重键：`task.fingerprint`（包含 `prompt/title/profile/provider/focusId/schedule/contract`）
- 语义冲突键：`task semantic key`，命中后会取消旧 active 任务并保留新任务

## 执行编排与回写

1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 调用外部执行运行时并收敛错误。
3. `finalizeResult` 更新任务状态并归档。
4. 发布到 `results`，立即唤醒 manager 消费结果。
5. `pending/paused` 快速取消：直接产出 `canceled` 结果并发布到 `results`。

## 取消与恢复

- `pending` 取消：立即标记并发布 `canceled`。
- `running` 取消：触发 `AbortController`，由外部执行链路收敛到 `canceled`。
- 启动恢复：持久化时 `running` 降级为 `pending`，重启后重入队列。
- session 恢复：worker 记录并持久化 `task.sessionId`；重试/重启恢复优先复用。`cancel.source=user` 视为不可恢复并丢弃 session，`deferred/system` 视为可恢复并保留 session（若存在）。

## 暂停与恢复（pause/resume）

- `pending -> paused`：停止调度，保持非终态，不生成 task_result。
- `running -> paused`：触发 `AbortController` 终止当前执行；worker 收到 abort 后不写入 `failed/canceled` 终态结果。
- `paused -> pending`：恢复入队并重新调度执行。
- `paused` 状态支持继续 `cancel`，行为与 `pending` 取消一致（直接产出 `canceled` 结果）。
- WebUI 二级菜单提供 `pause/resume/cancel` 控制动作；pause/resume 会写入系统事件消息。

状态返回约定：

- `pause` 成功状态：`paused`
- `resume` 成功状态：`pending`
- `cancel` 成功状态：`canceled`
- 典型拒绝状态：`already_done`、`already_paused`、`not_paused`、`already_canceled`

## session 复用/丢弃语义

| 条件 | 行为 | 关键实现 |
| --- | --- | --- |
| 任务重试或进程重启恢复，且 `task.sessionId` 存在、`sessionState!=discarded`、`cancel.source!=user` | 复用旧 session | `src/worker/session-state.ts` + `src/worker/run-retry.ts` |
| provider 返回 resume/thread/session 无效类错误（not found/expired/invalid） | 丢弃旧 session，下一次尝试不带 `sessionId` | `src/worker/session-state.ts` + `src/worker/run-retry.ts` |
| 用户主动取消（HTTP/显式用户来源） | 立即丢弃旧 session，后续必须新建 | `src/worker/cancel-task.ts`（`source=user`） |
| 系统取消或延后取消（`source=system/deferred`） | 保留旧 session 为可恢复 | `src/worker/cancel-task.ts`（`source=system/deferred`） |

`cancel.source` 归一化规则：`user|http -> user`，`deferred -> deferred`，其他来源统一视为 `system`。

## 本地验证步骤（最小复现）

1. 异常中断/恢复复用旧 session：`pnpm vitest run test/runtime-persistence-queue-reconcile.test.ts -t "persist+hydrate keeps reusable session on recovered pending task" && pnpm vitest run test/worker-run-retry-session.test.ts -t "reuses persisted session id on next attempt"`
2. 用户取消丢弃旧 session、系统延后取消保留旧 session：`pnpm vitest run test/worker-cancel-session-policy.test.ts`
3. 全量门禁：`pnpm run review-code-changes`

## 常见问题排查（持久化状态清理）

1. 停止运行中的进程，避免被后台循环立刻重写状态文件。
2. 清理 `.mimikit/runtime-snapshot.json` 与 `.mimikit/runtime-snapshot.json.bak`（或对应 `workDir` 下同名文件）。
3. 如需同时清空队列游标副作用，额外清理 `.mimikit/inputs/*.jsonl`、`.mimikit/results/*.jsonl` 后再重启。
4. 重启后检查首条 `runtime_hydrated` 日志与任务状态，确认恢复来源为预期快照。

## 关联数据结构

定义：`src/types/index.ts`

- `Task`

# 任务（Task）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- 本文档是 Task 领域的单一主规范（single source of truth），覆盖生命周期、派发去重、执行回写、取消恢复与 session 语义。
- 涉及 Task 的设计记录、提案、讨论稿仅作背景参考，不构成并行规范。
- 若与其他文档表述冲突，以本文档与对应实现代码（`src/execution/worker/*`、`src/policy/manager/*`）为准。

## 生命周期

- `pending`：manager 已派发，等待外部执行。
- `paused`：任务被用户暂停，或命中预算边界后以 `partial` 结果暂停，等待恢复。
- `running`：worker 正在调度外部执行。
- `succeeded | failed | canceled`：终态。

## 派发与去重

- 立即执行 Action：`<M:enqueue_task ... />`
- 生命周期控制 Action：`<M:mutate_task id="task-..." op="pause|resume|cancel|review_passed|merged|cleaned" />`
- worker 任务 profile 固定为 `worker`
- `Task.cwd` 是任务执行目录；若 `enqueue_task` 同时传入 `cwd + branch`，系统会在 enqueue 阶段自动创建或复用对应 worktree，并把 `Task.cwd` 写成真实 worktree 路径。若最终 `cwd` 在 git 仓库内，会额外记录 `repoKey + branch`，并在 `Task.git` / `TaskResultHandoff.git` 中补充 `worktreePath + branch`
- 单轮 action 去重键：`prompt + title + cwd + profile + provider + focusId + contract`
- active 任务去重键：`task.fingerprint`（包含 `prompt/title/cwd/profile/provider/focusId/repoKey/branch/contract`）
- 语义冲突键：`task semantic key`，命中后会取消旧 active 任务并保留新任务

## 资源排队

- worker 排队命中同一 `repoKey + branch` 时，不会失败，也不会 cancel；后来的任务保持 `pending` 等待锁释放
- 非 git 目录退化为 `cwd` 级别串行；同一目录只允许一个写任务运行
- 不同 repo 或不同 branch 仍可并发，只受全局 worker 槽位限制
- `Task.title` 是唯一展示标题来源；创建时可由 enqueue 阶段归一化生成，但读模型/WebUI 不再从 `task.prompt` 回推标题，缺失时直接显示 `task.id`

## 执行编排与回写

1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 调用外部执行运行时并收敛错误。
3. worker 完成时必须同时满足 `M:task_handoff + M:skill_usage status="done"` 完成协议；未满足则继续轮转或命中预算暂停。
4. `finalizeResult` 更新任务状态并归档。
5. 发布到 `results`，立即唤醒 manager 消费结果。
6. `pending/paused` 快速取消：直接产出 `canceled` 结果并发布到 `results`。

补充：

- 长任务命中 `worker.budget.maxDurationMs/maxRounds` 时，本次执行不会落成 `failed`；而是写出 `TaskResult.status=partial`，同时把 `Task.status` 置为 `paused`。
- 当前默认预算基线为 `30m / 3 rounds`；`pnpm run score:worker-budget` 的当前样本为 `25` 条结果、`p90=22.6m`、`budget_partial=0`，因此保持该默认值。
- `partial` 结果会保留 `handoff`、`archivePath`、`sessionId` 线索，恢复时继续复用已有 session。
- 预算暂停后会追加一个显式恢复 choice 到 `pendingUserChoices`；choice 通过 `effect.type=resume_task` 直接绑定恢复动作，不依赖文案判断。
- `succeeded` 结果的 handoff 只接受 `M:task_handoff` 结构化 JSON；不再从自由文本里启发式推导 `summary/decisions/nextSteps`。
- `partial/failed/canceled` 等非成功结果，若缺失结构化协议块，仍允许退回到最小自由文本摘要/清单提取。
- `M:task_handoff` 当前允许的核心字段是：`summary`、`decisions[]`、`next_steps[]`、`risks[]`、`artifacts[]`、`evidence[]`、`git_lifecycle`。

## 取消与恢复

- `pending` 取消：立即标记并发布 `canceled`。
- `running` 取消：触发 `AbortController`，由外部执行链路收敛到 `canceled`。
- 启动恢复：持久化时 `running` 降级为 `pending`，重启后重入队列。
- session 恢复：worker 记录并持久化 `task.sessionId`；重试/重启恢复优先复用。`cancel.source=user` 视为不可恢复并丢弃 session，`deferred/system` 视为可恢复并保留 session（若存在）。

## 暂停与恢复（pause/resume）

- `pending -> paused`：停止调度，保持非终态，不生成 task_result。
- `running -> paused`：触发 `AbortController` 终止当前执行；worker 收到 abort 后不写入 `failed/canceled` 终态结果。
- `paused -> pending`：恢复入队并重新调度执行。
- 从预算暂停恢复时，会先清理旧 `task.result`/`archivePath`，避免历史部分结果阻塞下一次结果消费。
- 预算暂停会生成一个显式恢复 choice：默认项是 `Keep paused`；当前实现默认不自动超时，用户返回后选择 `Continue now` 会直接调用恢复链路。
- 该 choice 会随 `pendingUserChoices` 一起持久化；若 snapshot 中缺失但任务态存在 `paused + partial + budget_exhausted`，启动时会按任务态补回同等恢复入口。
- `runtime-snapshot` 不再对旧 choice/schema 做任何兼容；旧状态文件会被直接拒绝，需人工清理或重写后再启动。
- `paused` 状态支持继续 `cancel`，行为与 `pending` 取消一致（直接产出 `canceled` 结果）。
- WebUI 二级菜单提供 `pause/resume/cancel` 控制动作；对预算暂停的可恢复任务，还会在任务行直接暴露 inline `Continue` 入口；pause/resume 会写入系统事件消息。

状态返回约定：

- `pause` 成功状态：`paused`
- `resume` 成功状态：`pending`
- `cancel` 成功状态：`canceled`
- 典型拒绝状态：`already_done`、`already_paused`、`not_paused`、`already_canceled`

## Git 闭环显式写回

- `mutate_task op="review_passed"`：任务已完成且存在 `Task.git` 时，显式写回 review passed；可选 `sha`，并写入 `review.at`。
- `mutate_task op="merged"`：要求当前 task 已记录 `review.passed=true`；写回 `merged=true` 与 `mergedAt`。
- `mutate_task op="cleaned"`：要求当前 task 已记录 `merged=true`；写回 `cleaned=true` 与 `cleanedAt`。
- 这三类 op 都必须附带可审计 `reason`，且 `reason` 必须能被当前用户输入直接支撑；单靠 task id/title 命中不足以通过 intent-evidence guard。
- 这些 op 只记录可审计状态，不直接执行 `review-code-changes`、`git merge` 或 `git worktree remove`。
- 读模型会把显式写回的 `Task.git.lifecycle` 与本地派生 closure 合并：显式记录不会被派生视图吃掉，派生出的 `cleaned=true` 等真实信号也不会被显式旧值回退。

## session 复用/丢弃语义

| 条件 | 行为 | 关键实现 |
| --- | --- | --- |
| 任务重试或进程重启恢复，且 `task.sessionId` 存在、`sessionState!=discarded`、`cancel.source!=user` | 复用旧 session | `src/execution/worker/session-state.ts` + `src/execution/worker/run-retry.ts` |
| provider 返回 resume/thread/session 无效类错误（not found/expired/invalid） | 丢弃旧 session，下一次尝试不带 `sessionId` | `src/execution/worker/session-state.ts` + `src/execution/worker/run-retry.ts` |
| 用户主动取消（HTTP/显式用户来源） | 立即丢弃旧 session，后续必须新建 | `src/execution/worker/cancel-task.ts`（`source=user`） |
| 系统取消或延后取消（`source=system/deferred`） | 保留旧 session 为可恢复 | `src/execution/worker/cancel-task.ts`（`source=system/deferred`） |
| 预算暂停（`Task.status=paused` + `TaskResult.status=partial`） | 保留旧 session，等待显式 `resume` 后继续 | `src/execution/worker/profiled-runner-loop.ts` + `src/execution/worker/resume-task.ts` |

`cancel.source` 归一化规则：`user|http -> user`，`deferred -> deferred`，其他来源统一视为 `system`。

## 本地验证步骤（最小复现）

1. 异常中断/恢复复用旧 session：`pnpm vitest run tests/runtime-persistence-queue-reconcile.test.ts -t "persist+hydrate keeps reusable session on recovered pending task" && pnpm vitest run tests/worker-run-retry-session.test.ts -t "reuses persisted session id on next attempt"`
2. 用户取消丢弃旧 session、系统延后取消保留旧 session：`pnpm vitest run tests/worker-cancel-session-policy.test.ts`
3. 预算样本校准：`pnpm run score:worker-budget`
4. 全量门禁：`pnpm run review-code-changes`

## 常见问题排查（持久化状态清理）

1. 停止运行中的进程，避免被后台循环立刻重写状态文件。
2. 清理 `.mimikit/runtime-snapshot.json` 与 `.mimikit/runtime-snapshot.json.bak`（或对应 `workDir` 下同名文件）。
3. 如需同时清空队列游标副作用，额外清理 `.mimikit/inputs/*.jsonl`、`.mimikit/results/*.jsonl` 后再重启。
4. 重启后检查首条 `runtime_hydrated` 日志与任务状态，确认恢复来源为预期快照。

## 关联数据结构

定义：`src/foundation/types/index.ts`

- `Task`
- `TaskGitExecution`
- `TaskResultHandoff`

关键字段补充：

- `Task.git`：记录 git 执行目录信息，字段为 `worktreePath`、`branch`、`lifecycle`
- `Task.git.lifecycle.review`：`passed/at?/sha?`，可由 worktree 内 `.mimikit/review-code-changes.passed` 哨兵派生，也可由 `mutate_task op="review_passed"` 显式写回
- `Task.git.lifecycle.merged`：若 `review.sha` 已进入 `main`，则标记为已合流；也可由 `mutate_task op="merged"` 显式写回，时间记入 `mergedAt`
- `Task.git.lifecycle.cleaned`：若 worktree 路径已不存在，则标记为已清理；也可由 `mutate_task op="cleaned"` 显式写回，时间记入 `cleanedAt`
- `TaskResultHandoff.git`：任务结果回写时透传同一份 git 执行信息与 `lifecycle`，用于归档、handoff 与复盘追踪
- 显式 git lifecycle 写回时，会同步重写已有 task archive 的 handoff/frontmatter，确保 archive 与 runtime task/result 保持同一份 lifecycle 事实
- worker 若在 `M:task_handoff.git_lifecycle` 中显式声明 `review/merged/cleaned`，收尾链路会优先吸收该协议结果，再与本地派生视图合并
- `review -> merge -> cleanup` 不允许靠 idle/后台链路静默回写 task 真相源；只能通过 `mutate_task` 显式动作、worker handoff 协议或可审计的本地派生信号收敛

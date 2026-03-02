# 任务与 Action（当前实现）

> 返回 [系统设计总览](../README.md)

## 任务生命周期

- `pending`：manager 已派发，等待执行。
- `running`：worker 执行中。
- `succeeded | failed | canceled`：终态。

## Task Plan 生命周期

- 对外名称：Plans；后端领域名：`taskPlans`。
- 状态：`active | blocked | done`。
- 触发策略：`trigger.mode = cron | scheduled_at | on_idle`。
- `trigger-wake-loop` 每秒检查 plan：
  - `cron/scheduled_at`：命中即发布 `system_event.name=trigger_fire`。
  - `on_idle`：达到闲暇窗口后按 `priority + FIFO` 触发。
- `on_idle` 冷却：`now - lastCompletedAt >= cooldownMs`。
- 每条 `UserInput/HistoryMessage/Task/TaskPlan` 必带 `focusId`。

## Focus 生命周期

- 主键：`focus_id`（例如 `focus-release-plan`）。
- 状态：`active | idle | done | archived`。
- 容量：
  - `active` 上限 = `worker.maxConcurrent`
  - `archived` 保留上限 = `2 * worker.maxConcurrent`
- 淘汰：按 `lastActivityAt` 的 LRU。

## 派发与去重

- 立即执行：`<M:run_task ... />`。
- 自动化/定时/空闲触发：`<M:create_plan ... trigger_mode="..." />`。
- worker 任务 profile 固定为 `worker`。
- 去重两层：
  - action 去重键：`prompt + title + profile + focusId`（plan 额外包含 trigger 签名）
  - queue 去重键：`task.fingerprint`（仅拦 active 任务）

## 执行与回写

1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 执行并收敛错误。
3. `finalizeResult` 更新任务状态并归档。
4. 发布到 `results`，立即唤醒 manager 消费结果。
5. `pending` 快速取消：发布 `canceled` 到 `results`，立即唤醒 manager。

## 取消与恢复

- `pending` 取消：立即标记并发布 `canceled`。
- `running` 取消：触发 `AbortController`，由执行链路收敛到 `canceled`。
- 启动恢复：持久化时 `running` 降级为 `pending`，重启后重入队列。

## Action 协议

协议与解析：`src/actions/protocol/*`

- Action 行格式：`<M:name key="value" />`
- 解析链路：`remark-parse` + `unist-util-visit`（无正则主解析）
- 仅解析回复尾部连续 action 区
- 参数在传输层统一字符串，manager 侧 schema 校验后执行

## Manager 消费的编排 Action

实现：`src/manager/action-registry.ts`、`src/manager/action-validation.ts`、`src/manager/action-apply.ts`、`src/manager/loop-batch-run-manager.ts`、`src/manager/runtime-adapter.ts`、`src/history/query.ts`

### Plan Action

- `create_plan`
  - 入参：`prompt`、`title`、`trigger_mode`、`focus_id?`、`priority?`、`source?`
  - 触发参数：`cron? | scheduled_at? | cooldown_ms? | max_runs?`
- `update_plan`
  - 入参：`id` + 至少一个更新字段
  - 可更新：`prompt|title|trigger_mode|cron|scheduled_at|cooldown_ms|max_runs|priority|source|status|last_task_id|focus_id`
- `delete_plan`
  - 入参：`id`

### 任务 Action

- `run_task`
  - 入参：`prompt`、`title`、`focus_id?`
- `cancel_task`
  - 入参：`id`

### 其他 Action

- `query_history`
  - 入参：`query`、`limit?`、`roles?`、`before_id?`、`from?`、`to?`
  - 注入关系：基础窗口在 `M:recent_history`，检索命中回填到 `M:history_lookup`。
- `read_file`
  - 入参：`path`、`from_line?`、`max_lines?`、`max_chars?`
  - 注入关系：读取结果回填到 `M:file_lookup`。
- `write_persona`
  - 入参：`content`
  - 行为：写入 `.mimikit/agent_persona.md`；内容变化时自动备份旧版本到 `.mimikit/agent_persona_versions/*.md`。
- `write_user_profile`
  - 入参：`content`
  - 行为：写入 `.mimikit/user_profile.md`。
- `compress_context`
  - 入参：无（严格空对象）
  - 行为：压缩 `history + tasks + managerCompressedContext`。
- `summarize_task_result`
  - 入参：`task_id`、`summary`
  - 行为：结果落历史前先做摘要覆盖。
- `restart_runtime`
  - 入参：无
  - 行为：持久化后退出，交由外层拉起。

## Prompt 注入标签

- `M:inputs`
- `M:batch_results`
- `M:tasks`
- `M:plans`
- `M:focus_list`
- `M:focus_contexts`
- `M:recent_history`
- `M:history_lookup`
- `M:compressed_context`

## 核心数据结构

定义：`src/types/index.ts`

- `UserInput`
- `Task`
- `TaskPlan`
- `HistoryMessage`
- `FocusMeta` / `FocusContext`

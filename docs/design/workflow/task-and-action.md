# 任务与 Action（当前实现）

> 返回 [系统设计总览](../README.md)

## 任务生命周期

- `pending`：manager 已派发，等待执行。
- `running`：worker 执行中。
- `succeeded | failed | canceled`：终态。

## Idle Intent（Todos）生命周期

- 对外名称：Todos；后端领域名：`idle_intents`。
- 状态：`pending | blocked | done`。
- `done` 归档存储在 `idleIntentArchive`，并继续注入 manager 上下文用于防重复创建。
- `idle-wake-loop` 到达闲暇阈值后，按 `priority + FIFO` 触发全部可执行 `pending` intent，逐条发布 `system_event.name=intent_trigger`。
- `on_idle` intent 的 CD 基于任务完成时间：`now - lastCompletedAt >= cooldownMs`。

## Focus 生命周期

- 主键：`focus_id`（例如 `focus-release-plan`）。
- 状态：`active | idle | done | archived`。
- 容量：
  - `active` 上限 = `worker.maxConcurrent`
  - `archived` 保留上限 = `2 * worker.maxConcurrent`
- 淘汰：按 `lastActivityAt` 的 LRU。
- 每条 `UserInput/HistoryMessage/Task/IdleIntent/CronJob` 必带 `focusId`。

## 派发与去重

- 立即执行：`<M:run_task ... />`。
- 定时执行：`<M:schedule_task ... />`。
- idle 周期执行：`<M:create_intent ... trigger_mode="on_idle" ... />`。
- worker 任务 profile 固定为 `worker`。
- 去重两层：
  - action 去重键：`prompt + title + profile(+schedule)`
  - queue 去重键：`task.fingerprint`（`prompt + title + profile + schedule`，仅拦 active 任务）

## 执行与回写

1. `enqueueWorkerTask` 入 `p-queue`。
2. `runTaskWithRetry` 执行并收敛错误。
3. `finalizeResult` 更新任务状态并归档。
4. 常规终态：发布到 `results`，并立即唤醒 manager 消费结果。
5. `pending` 快速取消：发布 `canceled` 到 `results`，并立即唤醒 manager。

## 取消与恢复

- `pending` 取消：立即标记并发布 `canceled`，随后立即唤醒 manager。
- `running` 取消：触发 `AbortController`，由执行链路收敛到 `canceled`。
- 启动恢复：`hydrateRuntimeState` 恢复全部任务状态；持久化时 `running` 降级为 `pending`，重启后重入队列，其余状态原样恢复用于历史展示。

## Action 协议

协议与解析：`src/actions/protocol/*`

- Action 行格式：`<M:name key="value" />`
- 解析链路（无正则主解析）：
  - `remark-parse` 构建 Markdown AST
  - `unist-util-visit` 遍历 HTML 节点，抽取 `<M:...>` 标签
  - 属性解析器处理 `\"`、`\'` 转义并保留换行
- 输出清洗：
  - 仅解析末尾连续 action 区
  - 可见文本会剥离非代码块中的 `M:` 标签
- 参数在传输层统一字符串；manager 侧 schema 校验后再执行。

## Manager 消费的编排 Action

实现：`src/manager/action-registry.ts`、`src/manager/action-validation.ts`、`src/manager/action-apply.ts`、`src/manager/loop-batch-run-manager.ts`、`src/history/query.ts`

当 manager 输出未注册 action、参数不合法、或可判定执行失败时，系统会注入 `system_event.name=action_feedback`，要求修正后重试。
action 名称、validate、apply 由 registry 单源维护，避免多文件枚举漂移。

## Manager 修正回合

- 每批次最多执行 `manager.maxCorrectionRounds` 次修正回合（配置项）。
- 若达到上限仍未收敛，系统返回 best-effort 文本，清空 action 执行，并写入 `system_event.name=manager_round_limit`。
- 当 provider 返回 context/token 类错误时，会自动执行一次压缩（`compressManagerContext`）后重试当前回合。

### Focus Action

- `create_focus`
  - 入参：`id`、`title?`、`status?`、`summary?`、`open_items?`
  - 行为：创建 focus；可同轮写入摘要与 open items。
- `update_focus`
  - 入参：`id` + 至少一个更新字段
  - 行为：更新状态/标题/摘要/open items。
- `assign_focus`
  - 入参：`target_id`、`focus_id`
  - 行为：改写既有对象归属（task/intent/cron/history message）。

### 任务与意图 Action

- `run_task`
  - 入参：`prompt`、`title`、`focus_id?`
  - 行为：创建并立即入队执行。
- `schedule_task`
  - 入参：`prompt`、`title`、`cron?`、`scheduled_at?`、`focus_id?`
  - 约束：`cron` 与 `scheduled_at` 互斥，且至少一个必填。
  - 行为：创建定时任务（cronJob）并写入系统历史。
- `create_intent`
  - 入参：`prompt`、`title`、`priority?`、`source?`、`trigger_mode?`、`cooldown_ms?`、`focus_id?`
  - 默认：`priority=normal`、`source=user_request`
- `update_intent`
  - 入参：`id` + 至少一个更新字段（含 `trigger_mode|cooldown_ms|focus_id`）
  - `status=done` 时从活跃队列移入归档。
- `delete_intent`
  - 入参：`id`
  - 约束：仅允许删除 `pending|blocked`。
- `cancel_task`
  - 入参：`id`
  - 行为：取消运行任务或关闭 cronJob。

### 其他 Action

- `query_history`
  - 入参：`query`、`limit?`、`roles?`、`before_id?`、`from?`、`to?`
  - 注入关系：基础窗口在 `M:recent_history`，检索命中回填到 `M:history_lookup`。
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

- `M:inputs`：当前批次输入
- `M:batch_results`：当前批次结果
- `M:focus_list`：focus 元信息
- `M:focus_contexts`：focus 摘要 + open items + focus recent messages
- `M:recent_history`：最近历史窗口（最小 5，预算 4KB）
- `M:history_lookup`：`query_history` 命中回填
- `M:compressed_context`：长会话压缩摘要

## Recent 窗口策略

- `recent_history`：最小 5 条；字节预算 4KB。
- `focus_contexts[*].recent_messages`：每个 focus 最小 5 条；字节预算 2KB。
- 裁剪过程：
  1. 候选按时间倒序收集
  2. 先保底最小条数
  3. 超预算时从最旧项开始裁剪
  4. 若裁剪会低于最小条数，则保留最小条数并允许超预算
- `recent_history` 与 `focus recent_messages` 按 `message.id` 去重。

## 核心数据结构

定义：`src/types/index.ts`

- `UserInput`：`id`、`role`、`text`、`createdAt`、`focusId`、`quote?`
- `Task`：`id`、`prompt`、`title`、`status`、`focusId`、`profile` ...
- `IdleIntent`：`id`、`prompt`、`title`、`status`、`focusId`、`triggerPolicy`、`triggerState` ...
- `CronJob`：`id`、`prompt`、`title`、`focusId`、`cron|scheduledAt` ...
- `HistoryMessage`：`id`、`role`、`text`、`createdAt`、`focusId` ...

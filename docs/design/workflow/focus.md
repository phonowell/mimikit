# 焦点（Focus）工作链路规范

> 返回 [Workflow 索引](./task-and-action.md)

## 文档目标

- 本文档是 Focus 领域的单一主规范（single source of truth），覆盖定义、状态机、端到端链路、约束、持久化与对外视图。
- 阅读本文档不需要先读其他文档；引用文档仅用于延伸细节。
- 若本文档与其他文档冲突，以代码实现与本文档为准。

## 系统定位

- Focus 是编排域内的“工作主题单元”，用于把 `input/history/task/plan/choice` 绑定到同一上下文。
- Focus 只负责上下文与状态治理，不承载 worker 执行逻辑。
- 执行仍由外部运行时完成，Focus 仅影响编排决策与 Prompt 注入。

## 单一事实源（代码）

- 核心目录：`src/focus/*`
- Manager 动作：`src/manager/action-apply-focus.ts`
- Prompt 构建：`src/prompts/build-prompts.ts`
- 运行时快照：`src/orchestrator/core/runtime-persistence.ts`
- WebUI 读模型：`src/orchestrator/read-model/focus-view.ts`

## 数据模型

- `FocusMeta`
- 字段：`id/title/status/createdAt/updatedAt/lastActivityAt`
- `FocusContext`
- 字段：`focusId/summary/openItems/updatedAt`
- `ManagerFocusCompressedContext`
- 字段：`focusId/summary/updatedAt/firstKeptEntryId?/details?`
- `PendingUserChoice`
- 字段含 `focusId`，用于把待用户选择的问题挂到具体 focus

## ID 与命名规范

- Action 参数用 `focus_id`；运行时字段用 `focusId`。
- Focus ID 必须匹配：`^focus-[a-zA-Z0-9._-]+$`。
- 保留 ID：
- `focus-global`：系统保留 focus。
- `focus-inbox`：业务兜底 focus。

## 状态机

- 状态：`active | idle | done | archived`
- 语义：
- `active`：活跃工作焦点。
- `idle`：可复用但不活跃。
- `done`：已完成，仍可被查看/引用。
- `archived`：归档，不进入常规工作视图。

## 全局不变量

- `focus-global` 必须存在且永远是 `active`。
- `focus-inbox` 不允许最终落在 `done/archived`，会归一化为 `idle`。
- `focus-global` 不持久化 `FocusContext` 与压缩上下文。
- `archived` focus 不进入 WebUI Focus 列表，也不进入 manager 的 focus prompt 段。

## 默认归属与继承

- 默认归属算法 `resolveDefaultFocusId(runtime)`：
1. 最近活跃的 `active` 且非 `focus-global`
2. 最近活跃的 `idle` 且非 `focus-global/focus-inbox`
3. `focus-inbox`
- 用户输入带 `quote` 时，优先继承被引用历史消息的 `focusId`。
- 无引用时按默认归属算法。
- manager `enqueue_task`/`ask_user_choice` 未显式传 `focus_id` 时按默认归属。
- manager 回复与 manager 错误系统消息均使用 `resolveDefaultFocusId(runtime)`。
- manager `enqueue_task` 未显式传 `provider` 时，会优先复用同 `focus` 最近活跃任务的 provider，减少跨 provider 切换与额外编排成本。

## 系统事件与 Focus 归属

- 启动系统消息（`startup`）写入 history，固定归属 `focus-global`。
- manager 系统输入事件（如 `trigger_fire`、`worker_slot_freed`）默认归属 `focus-global`。
- `manager_error` 不是 manager system input，而是写入 history 的系统消息；其 focus 走默认归属，不强制是 `focus-global`。

## Focus 动作契约（Manager Action）

实现入口：`src/manager/action-apply-focus.ts`

### `upsert_focus`

- 必填：`id`
- 可选：`title/status/summary/open_item_{n}`
- `open_item_{n}` 约束：
- 值必须为非空字符串。
- 索引必须从 `1` 连续递增，不可跳号。
- 行为：
- 不存在则创建，存在则更新。
- `status` 会应用保留 focus 归一化规则。
- `summary/openItems` 写入 `FocusContext`。
- `openItems` 去重与裁剪：`MAX_FOCUS_OPEN_ITEMS = 3`。
- 执行后触发容量治理并持久化快照。

### `assign_focus`

- 参数：`target_type`(`task|plan|history`)、`target_id`、`focus_id`
- 行为：
- 将目标对象的 `focusId` 改为指定 focus。
- 自动 `ensureFocus + touchFocus`。
- 成功后触发容量治理并持久化快照。

### 关于 `compress_context`

- 当前代码库不存在可执行的 `compress_context` manager action。
- `managerFocusCompressedContexts` 结构已在运行时与 Worker Prompt 注入链路中预留，但本文档不将其视为当前可用动作能力。

## 任务结果回写 FocusContext

实现：`src/focus/result-feedback.ts`

- 任务完成（`succeeded/failed/canceled`）时同步回写对应 focus 的上下文。
- `focus-global` 不写业务上下文。
- `summary` 优先级：
1. `task.result.handoff.summary`
2. 基于任务标题 + 输出首行的归一化摘要
- `openItems` 优先级：
1. `handoff.nextSteps`
2. 输出中的 checklist（`- [ ] ...`）
3. 失败/取消时自动 follow-up
- 最终 `openItems` 去重并裁剪到 3 条。

## 容量治理与清理

实现：`src/focus/capacity.ts`

- `active` 业务 focus 上限：`worker.maxConcurrent`（不计 `focus-global`）。
- 超限时按 `lastActivityAt` 的 LRU，把最老 active 业务 focus 降级为 `idle`。
- `archived` 保留上限：`2 * worker.maxConcurrent`。
- 清理仅删除“无引用 archived focus”；引用来源：
- `tasks/taskPlans/inflightInputs`
- `history/*.jsonl`
- 删除时同步移除：
- `FocusMeta`
- `FocusContext`
- `managerFocusCompressedContexts` 残留

## Working Focus 选择

实现：`src/manager/loop-batch-run-manager.ts`

- 每轮 manager 先收集偏好 focus：
- 当前批次输入 `inputs[*].focusId`
- 当前批次结果关联任务的 `task.focusId`
- working focus 选择会合并并去重：
- `preferredFocusIds`
- 当前 `status=active` 的 focus
- 按活跃度排序的非 archived focus
- 最终截断：`MAX_WORKING_FOCUSES = 3`

## Prompt 注入规范

- Manager Prompt：
- `M:state_packet.focus_list`：非 archived focus 列表（含 `is_active`）
- `M:state_packet.focus_contexts`：working focus 的 `summary/open_items/recent_messages`（过滤 `focus-global`）
- `M:event_packet.recent_history`：未被 working focus recent 覆盖的近期历史
- 各段受 `manager.promptSections.*MaxBytes` 预算控制
- Worker Prompt：
- `M:focus_context`：当前任务 focus 的 `focus_title/summary/open_items/context_updated_at`
- 若存在压缩上下文，再注入 `compressed_summary/compressed_updated_at`

## 持久化与对外视图

- runtime snapshot 字段：
- `focuses`
- `focusContexts`
- `managerFocusCompressedContexts`
- 读写入口：`src/orchestrator/core/runtime-persistence.ts`
- WebUI/SSE：
- `GET /api/events` 的 `snapshot` 包含 `focuses`
- Focus 读模型仅输出非 archived focus，且做 `title/summary/openItems` 归一化与兜底

## 完整性验收清单

- 新输入可确定且可解释地落到唯一 `focusId`。
- task/plan/history/choice 均能携带并维持 `focusId`。
- `focus-global/focus-inbox` 保留规则不会被业务逻辑绕过。
- 容量治理会收敛 active 与 archived 数量。
- Manager 与 Worker Prompt 都能拿到对应 focus 上下文。
- 重启后从 snapshot 恢复，不丢 Focus 主状态。
- WebUI 视图与 runtime Focus 状态一致。

## 相关文档

- Action 协议：`./action.md`
- Task 生命周期：`./task.md`
- Plan 触发：`./plan.md`
- API 与状态：`./interfaces-and-state.md`
- 系统架构：`../architecture/system-architecture.md`

# 焦点（Focus）主设计规范

> 返回 [Workflow 索引](./task-and-action.md)

## 定位与边界

- 本文档是 Focus 系统**主规范与入口**；其他文档提到 Focus 时，以本文为准。
- Focus 是编排域内“工作主题单元”，用于把 `input/history/task/plan/choice` 归属到同一上下文。
- Focus 只负责编排态与上下文治理，不承载执行逻辑（执行仍由 worker 外部运行时完成）。

## 数据模型（单一事实源）

实现与类型：
- `src/focus/*`
- `src/types/index.ts`
- `src/storage/runtime-snapshot-schema.ts`

核心对象：
- `FocusMeta`：`id/title/status/createdAt/updatedAt/lastActivityAt`
- `FocusContext`：`focusId/summary/openItems/updatedAt`
- `ManagerFocusCompressedContext`：`focusId/summary/updatedAt/firstKeptEntryId?/details?`
- `activeFocusIds`：当前 active focus 的索引列表（运行时维护）

ID 规范：
- Action 入参 `focus_id` 必须匹配：`^focus-[a-zA-Z0-9._-]+$`
- 运行时字段使用 `focusId`（驼峰）
- 保留 ID：
- `focus-global`：系统保留，全局系统事件 focus
- `focus-inbox`：业务兜底 focus

## 状态机与不变量

状态：
- `active | idle | done | archived`

硬约束：
- `focus-global` 永远保持 `active`，且必须存在于 `activeFocusIds`
- `focus-inbox` 永远可复用；对 inbox 设置 `done/archived` 会被归一化为 `idle`
- `ensureFocus` 会修复历史脏数据：若 inbox 旧状态是 `done/archived`，自动复活为 `idle`
- `activeFocusIds` 仅允许“去重后、确实为 active 的 focus”
- `archived` focus 不进入 UI Focus 列表，也不进入 manager 的 focus prompt 段

## 默认归属与继承规则

归属对象（必须带 `focusId`）：
- `UserInput`
- `HistoryMessage`
- `Task`
- `TaskPlan`
- `PendingUserChoice`

默认归属算法（`resolveDefaultFocusId`）：
1. 最近活跃的 `active` 且非 `focus-global`
2. 最近活跃的 `idle` 且非 `focus-global/focus-inbox`
3. `focus-inbox`

继承与系统事件：
- 用户输入若带 `quote`，优先继承被引用消息的 `focusId`；否则走默认归属算法
- 系统事件输入默认归属 `focus-global`（`startup/idle/worker_slot_freed/trigger_fire/manager_error` 等）
- manager 回复与错误消息默认使用当前 `resolveDefaultFocusId(runtime)`

## Focus 动作契约（Manager Action）

实现：
- `src/manager/action-apply-schema.ts`
- `src/manager/action-apply-focus.ts`
- `src/focus/assign.ts`
- `src/focus/state.ts`

### `upsert_focus`

参数：
- 必填：`id`
- 可选：`title/status/summary/open_item_{n}`
- `open_item_{n}` 必须为非空字符串，`n >= 1`，按编号升序收集

语义：
- 不存在则创建 focus，存在则更新
- `status` 更新受不变量约束（global/inbox 归一化）
- `summary/openItems` 写入 `FocusContext`
- `openItems` 统一归一化并裁剪到 `MAX_FOCUS_OPEN_ITEMS = 3`
- 写入后执行容量治理（`enforceFocusCapacity`）并持久化 snapshot

### `assign_focus`

参数：
- `target_type`：`task | plan | history`
- `target_id`
- `focus_id`

语义：
- 将目标对象的 `focusId` 变更到指定 focus
- 自动 `ensureFocus + touchFocus`
- 成功后持久化，并执行容量治理

### `compress_context`

参数：
- 无参数

语义：
- 按 focus 维度压缩上下文，产物写入 `managerFocusCompressedContexts`
- 压缩材料包含该 focus 的近期历史、任务快照、已有压缩摘要
- `summary` 空值会直接报错（不吞错）

## 容量治理与裁剪

实现：`src/focus/capacity.ts`

- `active` 业务 focus 上限：`worker.maxConcurrent`（不计 `focus-global`）
- 超限时按 `lastActivityAt` LRU 将最老 active 业务 focus 降级为 `idle`
- `archived` 保留上限：`2 * worker.maxConcurrent`
- 超限清理时仅删除“无引用 archived focus”，引用来源包括：
- 当前 `tasks/taskPlans/inflightInputs`
- 历史消息 `history/*.jsonl`
- 清理会同时移除 `FocusContext`、压缩上下文与 `activeFocusIds` 残留

## Working Focus 选择（Prompt 入口）

实现：`src/focus/batch.ts`、`src/focus/capacity.ts`

- manager 每轮先收集偏好 focus（当前批次 input + result 对应 task）
- `selectWorkingFocusIds` 合并：
- `preferredFocusIds`
- `activeFocusIds`
- 按活跃度排序的非 archived focus
- 最终截断为 `MAX_WORKING_FOCUSES = 3`

## Prompt 注入规范

实现：`src/focus/prompt.ts`、`src/prompts/build-prompts.ts`

Manager 注入：
- `M:focus_list`：非 archived focus 列表（含 `is_active`）
- `M:focus_contexts`：working focus 的 `summary/open_items/recent_messages`
- `M:recent_history`：未被 working focus recent 覆盖的最近历史窗口
- 各段受 `manager.promptSections.*MaxBytes` 预算控制（含 `focusListMaxBytes/focusContextsMaxBytes`）

Worker 注入：
- `M:focus_context`：当前任务 `focusId` 对应 `focus_title/summary/open_items/context_updated_at`
- 若有压缩摘要，追加 `compressed_summary/compressed_updated_at`

## FocusContext 自动回写（任务结果）

实现：`src/focus/result-feedback.ts`

- 每次任务完成（`succeeded/failed/canceled`）都会同步该任务 focus 的上下文
- `summary` 来源优先级：
1. `task.result.handoff.summary`
2. 基于任务标题 + 结果首行的归一化摘要
- `openItems` 来源优先级：
1. `handoff.nextSteps`
2. 输出中的 checklist（`- [ ] ...`）
3. 失败/取消时自动生成 follow-up 项
- 最终 `openItems` 去重并裁剪到 3 条

## 持久化与对外视图

持久化：
- runtime snapshot 字段：`focuses/focusContexts/activeFocusIds/managerFocusCompressedContexts`
- 入口：`src/orchestrator/core/runtime-persistence.ts`

WebUI/SSE：
- `GET /api/events` 的 `snapshot` 包含 `focuses`
- Focus 读模型：`src/orchestrator/read-model/focus-view.ts`
- 输出仅包含非 archived focus；`title/summary/openItems` 会做归一化与兜底

## 与其他规范的关系

- Action 协议与通用约束：`./action.md`
- Task 运行态与结果回流：`./task.md`
- Plan 触发与 `focusId` 并行语义：`./plan.md`
- API 与状态目录：`./interfaces-and-state.md`
- 系统级架构入口：`../architecture/system-architecture.md`

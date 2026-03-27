# 动作（Action）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- Action 实现主源：`src/policy/manager/manager-turn-schema.ts`、`src/policy/manager/action-registry-definitions.ts`、`src/policy/manager/action-validation.ts`、`src/policy/manager/action-apply.ts`
- 本文只描述当前唯一有效的 manager action 协议；旧 XML / `name+attrs` / `*_1` 编号参数均已删除，不构成兼容协议。

## Turn 协议

- manager 对外只接受单个结构化对象：`{ reply, actions }`
- `reply`：用户可见文本
- `actions`：结构化 action 数组
- 不存在 `version`
- 不存在 `reply_text`
- 不存在 XML 尾巴、`Parsed.attrs` 或外部/内部双语法

## Action Catalog

### 任务类

- `enqueue_task`
- `task_control`
- `record_task_git`

### 计划类

- `set_plan`
- `delete_plan`

### 交互类

- `ask_user_choice`

### 归属与记忆类

- `assign_focus`
- `remember_memory`
- `remember_project_profile`

## 关键合同

### `enqueue_task`

- 结构：`{ type: "enqueue_task", task }`
- `task` 必须包含：
  - `title`
  - `cwd`
  - `mode`
  - `goal`
  - `in_scope[]`
  - `out_of_scope[]`
  - `done_when[]`
  - `context_refs[]`
  - `instructions[]`
- `worker_prompt` 已删除；worker prompt 由任务合同自动生成。
- `branch` 已删除；git worktree / branch 由运行时决定。

### `task_control`

- 结构：`{ type: "task_control", task_id, action, instructions }`
- `action = pause | resume | cancel`
- `instructions[]` 仅在 `action="resume"` 时作为下一轮恢复补充说明，其余情况必须为空数组。

### `record_task_git`

- 结构：`{ type: "record_task_git", task_id, state }`
- `state = review_passed | merged | cleaned`
- 只记录外部已发生的 git 闭环状态，不执行 review / merge / cleanup 本身。

### `set_plan`

- 结构：`{ type: "set_plan", plan_id, plan }`
- `plan_id = null` 表示创建；非空表示按该 ID 整体替换
- `plan` 必须包含：
  - `title`
  - `trigger`
  - `task`
  - `priority`
  - `max_runs`
- `plan.task` 与 `enqueue_task.task` 使用同一合同

### `delete_plan`

- 结构：`{ type: "delete_plan", plan_id }`
- 语义：把计划关闭为 `done(canceled)`；实体保留用于审计

### `ask_user_choice`

- 结构：`{ type: "ask_user_choice", question, default_option_id, options }`
- `options[]` 中每项必须包含 `id / label / reason`

### `assign_focus`

- 结构：`{ type: "assign_focus", target_type, target_id, focus_id }`
- `target_type = task | plan | history`
- 这是唯一保留的 focus action；不再允许 manager 直接写 `summary/openItems`

### `remember_memory`

- 结构：`{ type: "remember_memory", content, source_input_id, source_quote }`
- `content` 必须是单行稳定 digest，且 `<= 240 chars`
- checklist、多行过程文本、协议标签和 runtime 引用会被拒绝
- `source_input_id` 必须命中当前轮真实用户输入
- `source_quote` 必须是该输入中的原文片段
- `content` 也必须能被同一条当前输入直接支撑；不再依赖旧历史的重复表达放行

### `remember_project_profile`

- 结构：`{ type: "remember_project_profile", content, source_input_id, source_quote }`
- 复用 `remember_memory` 的内容 hygiene guard 与 provenance 必填要求
- `content` 可以在 `source_quote` 基础上做最小归纳，但不得脱离原意
- 文件路径按 `runtime.startup.worktree` 绑定；不同 repo / worktree 不共享 profile

## 执行语义

- `enqueue_task`：创建或复用 worker task；命中同语义旧任务时，按语义冲突规则处理
- `task_control`：调用 pause / resume / cancel 执行链路
- `record_task_git`：调用 git lifecycle 写回链路，并同步 task / handoff / archive
- `set_plan`：创建或整体替换计划
- `delete_plan`：关闭计划
- `ask_user_choice`：stop action；命中后当前批次停止后续 apply
- `assign_focus`：仅修改 task / plan / history 的 `focusId`
- `remember_memory`：立即写入 `memory/MEMORY.md`，并通过 `memory_remembered` system event 回执 `entry_id/ref/operation`
- `remember_project_profile`：立即写入 repo 绑定的项目档案文件，并通过 `project_profile_remembered` system event 回执 `entry_id/ref/operation`

## Guardrail

- `enqueue_task`、`task_control`、`record_task_git`、`set_plan`、`delete_plan`、`ask_user_choice`、`remember_memory`、`remember_project_profile` 都受 intent-evidence guard 约束
- 没有当前用户输入直接支撑时，`task_result` / `history` / `trigger` 只能作为补充证据，不能单独驱动高风险 action
- `record_task_git` 必须同时命中“任务引用 + 闭环动作意图”
- `task_control(cancel)` 支持“同 focus / 同 cwd 的唯一活跃任务被替代”这一例外，不要求额外显式取消措辞
- 两个 remember action 来源证据不足时都静默 suppress，不进入 apply，也不触发 correction 澄清

## Action Surface

- 当前 manager 只暴露统一 surface：`task + plan + dialog + focus + memory`
- `query_context` / `read_file` 已删除；主线程默认不承担本地细读 / 检索
- `restart_runtime` 已从 manager action surface 删除
- prompt 中的 action 卡完全由代码生成，不再手写维护另一套文案

## Prompt 注入标签

- 稳定包：`M:state_packet`
- 易变包：`M:event_packet`
- 项目档案：`M:project_profile`
- 长期高优先级记忆：`M:remembered_memory`
- 其余长期记忆：`M:memory`

当前实现中的主要子字段：

- `M:state_packet.focus_list`
- `M:state_packet.working_focuses`
- `M:state_packet.tasks`
- `M:state_packet.plans`
- `M:event_packet.environment`
- `M:event_packet.inputs`
- `M:event_packet.batch_results`
- `M:event_packet.recent_history`
- `M:event_packet.action_feedback`
- `M:event_packet.packet`

约束补充：

- `M:state_packet.tasks` 只承载稳定任务状态与归档路径，不再重复展开详细 task result
- `M:state_packet.tasks` / `M:state_packet.plans` 不再承载 worker prompt、task contract、scope/acceptance 等执行载荷
- `M:event_packet.batch_results` 是当前批次 task result 的唯一详细结果通道
- `M:event_packet.batch_results` 只接收压缩后的 result / handoff / evidence，不再回灌执行载荷
- `M:event_packet.packet.latestResult` 只保留摘要指针，用于快速判断本轮结果重心

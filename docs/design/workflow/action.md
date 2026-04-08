# 动作（Action）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- Action 实现主源：`src/policy/manager/manager-turn-schema.ts`、`src/policy/manager/action-registry-definitions.ts`、`src/policy/manager/action-validation.ts`、`src/policy/manager/action-apply.ts`
- 本文只描述当前唯一有效的 manager action 协议；旧 XML / `name+attrs` / `*_1` 编号参数均已删除，不构成兼容协议。

## Turn 协议

- manager 对外只接受单个结构化对象：`{ reply, actions, decision }`
- `reply`：用户可见文本
- `actions`：结构化 action 数组
- `decision`：本轮编排判断；仅用于显式声明 `continue | handoff | escalate`
- 当 `decision.mode = handoff | escalate` 时，必须附结构化 `reason`
- `decision` 不是自由文本捷径；运行时只会在当前批次已有匹配的结构化结果/反馈证据时承认该停下决定
- 不存在 `version`
- 不存在 `reply_text`
- 不存在 XML 尾巴、`Parsed.attrs` 或外部/内部双语法

## Action Catalog

### 任务类

- `enqueue_task`
- `task_control`

### 计划类

- `set_plan`
- `delete_plan`

### 归属与记忆类

- `assign_focus`
- `remember_memory`
- `remember_project_profile`

## 关键合同

### `enqueue_task`

- 结构：`{ type: "enqueue_task", task }`
- 只接受这一份结构化合同；旧 XML / `name+attrs` / `*_1` 编号参数 / 兼容别名都无效。
- `task` 必须包含：
  - `title`
  - `cwd`
  - `mode`
  - `use_worktree`
  - `goal`
  - `in_scope[]`
  - `out_of_scope[]`
  - `done_when[]`
  - `context_refs[]`
  - `instructions[]`
- `worker_prompt` 已删除；worker prompt 由任务合同自动生成。
- `branch` 已删除；git worktree / branch 由运行时决定。
- manager turn 解析流程固定为“结构校验 -> 任务合同规范化 -> 严格校验”；不会为超长合同补兼容字段或保留旧协议入口。
- 规范化会优先压缩单条字段中的 `；` 分句，并裁剪列表数量；当前覆盖 `goal/in_scope/out_of_scope/done_when/context_refs/instructions`。
- `cwd` 必须指向现有目录。
- `use_worktree` 必填；不需要独立 worktree 时显式传 `false`。
- 仅当 `task.use_worktree=true` 且 `mode="write"` 时，运行时才会为仓库任务 materialize git worktree；否则直接在给定 `cwd` 执行。
- 对 `use_worktree=true` 的仓库写任务，`cwd` 只表示仓库内真实执行起点；worktree 路径由运行时 materialize，manager 不得直接填写未来 worktree 路径。
- 若 `cwd` 是 repo 内子路径，运行时会把该子路径映射到目标 worktree；若映射后的目录不存在、不是目录或不可访问，`enqueue_task` 会直接拒绝，不会创建 task。
- 同一轮默认只派发一个粗粒度 `enqueue_task`；只有当多个任务的目录边界独立且互不冲突时，才允许并发 fan-out。当前校验层会直接拒绝同批次重叠目录的多个 `enqueue_task`。

### `task_control`

- 结构：`{ type: "task_control", task_id, action, instructions }`
- `action = pause | resume | cancel`
- `instructions[]` 仅在 `action="resume"` 时作为下一轮恢复补充说明，其余情况必须为空数组。
- 对 `resume`，若当前 focus 下只有一个 paused task，guard 允许把泛化续跑输入直接落到该 task；不再要求用户重复 `task_id/title` 或旧合同词面。

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

### `assign_focus`

- 结构：`{ type: "assign_focus", target_type, target_id, focus_id }`
- `target_type = task | plan | history`
- 这是唯一保留的 focus action；不再允许 manager 直接写 `summary/openItems`
- 属于辅助归属写入；schema 不完整或 target 在当前 runtime snapshot 中不可用时，优先 suppress，不得污染主回复

### `remember_memory`

- 结构：`{ type: "remember_memory", content, source_input_id, source_quote? }`
- `content` 必须是单行稳定 digest，且 `<= 240 chars`
- checklist、多行过程文本、协议标签和 runtime 引用会被拒绝
- `source_input_id` 必须命中当前轮真实用户输入
- `source_quote` 为可选审计提示；拿不准原文片段时留空
- runtime 只校验 provenance 与内容 hygiene；不再用词面 overlap / 历史重复命中去猜测 `content` 是否“被用户说过”
- 这类记忆/档案写入属于辅助动作；即使落盘阶段失败，也只能记录内部 apply feedback，不得污染主回复

### `remember_project_profile`

- 结构：`{ type: "remember_project_profile", content, source_input_id, source_quote? }`
- 复用 `remember_memory` 的内容 hygiene guard 与 provenance 必填要求
- `content` 可以基于当前输入做最小归纳，但不得脱离原意
- 文件路径按 `runtime.startup.worktree` 绑定；不同 repo / worktree 不共享 profile
- apply 阶段若写盘失败，同样只允许内部记录，不得把失败升级成用户可见主链阻塞

## 执行语义

- `enqueue_task`：创建或复用 worker task；命中同语义旧任务时，按语义冲突规则处理
- `task_control`：调用 pause / resume / cancel 执行链路
- `set_plan`：创建或整体替换计划
- `delete_plan`：关闭计划
- `assign_focus`：仅修改 task / plan / history 的 `focusId`
- `remember_memory`：立即写入 `memory/MEMORY.md`，并通过 `memory_remembered` system event 回执 `entry_id/ref/operation`
- `remember_project_profile`：立即写入 repo 绑定的项目档案文件，并通过 `project_profile_remembered` system event 回执 `entry_id/ref/operation`

## Guardrail

- 证据充分时默认推进；不要因“更稳妥”把已可执行事项退回成多余追问。
- manager 默认工作模式是“继续推进并做常规判断”；不要把 worker 的“建议下一步”原样退回给用户。
- `intent-evidence` 是风险分级门禁，不是所有 action 一刀切的字面重叠比较器。
- `enqueue_task`、`task_control`、`set_plan`、`delete_plan`、`remember_memory`、`remember_project_profile` 都受 intent-evidence guard 约束
- 没有当前用户输入直接支撑时，`task_result` / `history` / `trigger` 只能作为补充证据，不能单独驱动高风险 action
- 没有新的用户输入时，`task_result` 仍可驱动同一目标内的低风险续跑、常规纠偏、补证据或停在 handoff；不能据此越过高风险门禁。
- 当本轮是 `task_result`-only 且运行时存在可疑续跑对象时，follow-up guard 只把 `cwd/resource mode/useWorktree`、`lastTaskId`、`continuation_of`、单一 active plan/task 视为候选缩小信号；只有再叠加语义一致与对象归属一致，才允许 advisory-only 轮次直接视作已续跑，否则必须产出具体 action 或显式 `decision` 停在 handoff / 上提。
- 当 `enqueue_task` / `set_plan` 明确是在延续当前对象时，应优先填写结构化 `continuation_of={ type:"plan"|"task", id }`；它提供 provenance 与候选定位，但不能替代任务合同语义校验。
- 对 `enqueue_task`，单一 active plan / 单一 result task、同仓同模式、相同 worktree 语义都只能帮助缩小候选；最终仍需确认 draft 与候选 plan/task 属于同一目标。
- 对 `set_plan` 更新，用户引用当前 plan 只能说明“改的是哪个 plan”，不能单独说明“可以改成什么”；更新内容仍需被当前输入在语义上直接支撑。
- `task_control(cancel)` 不再因为“同 focus / 同 cwd 的唯一活跃任务被替代”而自动成立；replacement batch 还必须有输入明确表达停止旧任务。
- `task_control(resume)` 不再因为“当前 focus 下只有一个 paused task”而自动成立；没有新输入时默认不放行 resume，存在新输入时也必须能指向该 task 本身或其任务语义。
- 两个 remember action 必须命中当前轮 provenance：`source_input_id` 指向当前用户输入；`source_quote` 仅作可选审计提示，不再作为硬门槛

## Action Surface

- 当前 manager 只暴露统一 surface：`task + plan + focus + memory`
- `query_context` / `read_file` 已删除；主线程默认不承担本地细读 / 检索
- `restart_runtime` 已从 manager action surface 删除
- prompt 中的 action 卡完全由代码生成，不再手写维护另一套文案
- 简版 action 卡也必须直接暴露会改变动作语义的关键分叉；例如 `set_plan` 必须明写 `plan_id=null` 表示创建，避免首轮把新建计划误写成更新既有 plan

## Prompt 注入标签

- manager 系统 prompt 只定义编排身份、action 门禁、输出协议与上下文入口；不再承载历史实现演化备注。
- manager 只保留四类高价值上下文：目标、计划、当前状态、验收门禁；具体执行默认外放给 worker 或外部运行时。
- 文件系统是真相源；packet 标签只是注入给模型的状态投影，不能被当作新的状态层。

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
- `M:state_packet.tasks` / `M:state_packet.plans` 不再承载完整 worker prompt 或执行原文，但仍保留稳定合同 digest（如 `goal/scope/acceptance`）供 manager 做编排与验收门禁判断；这里的 digest 是收敛后的当前协议视图，不是任何旧合同别名或兼容载荷
- `M:event_packet.batch_results` 是当前批次 task result 的唯一详细结果通道；仅当当前用户输入显式点名历史 `task_id` / `archive_path` 且本批次缺少对应详细结果时，允许只读 hydrate 既有 archive，并复用该通道回补必要正文/证据
- `M:event_packet.batch_results` 只接收压缩后的 result / handoff / evidence，不再回灌执行载荷
- `M:event_packet.packet.latestResult` 只保留摘要指针，用于快速判断本轮结果重心

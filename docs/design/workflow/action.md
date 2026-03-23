# 动作（Action）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- Action 的代码主源是 `src/manager/action-registry-definitions.ts`、`src/manager/action-surface.ts`、`src/manager/action-validation.ts`。
- 本文档是面向人的实现说明，覆盖协议、域边界、动态 surface、执行语义与关键参数约束。
- 涉及 Action 的设计记录、提案、简化说明仅作背景参考，不构成并行规范；若与实现冲突，以代码为准。

## 领域边界

- 本文档只定义 manager 可消费 action 协议与执行语义。
- Task 生命周期细节以 `./task.md` 为准；Plan 触发与生命周期以 `./plan.md` 为准；Focus 归属与容量以 `./focus.md` 为准；Memory 刷新策略以 `./memory.md` 为准。

## 协议

协议与解析：`src/actions/protocol/*`

- Action 行格式：`<M:name key="value" />`
- 解析链路：`remark-parse` + `unist-util-visit`（无正则主解析）
- 仅解析回复尾部连续 action 区
- 参数在传输层统一字符串，manager 侧 schema 校验后执行

## Manager 消费的编排 Action

实现：`src/manager/action-registry-definitions.ts`、`src/manager/action-validation.ts`、`src/manager/action-apply.ts`

### 任务类

- `enqueue_task`
- `mutate_task`
- `set_task_result_summary`

### 计划类

- `create_plan`
- `update_plan`
- `delete_plan`

### 交互类

- `ask_user_choice`

### 状态归属与记忆类

- `upsert_focus`
- `assign_focus`
- `remember_memory`

## 动态 Action Surface

实现：`src/manager/action-surface.ts`、`src/manager/loop-batch-run-helpers.ts`、`src/manager/action-feedback-collect.ts`

- `user_input` / `mixed`：开放 `task + plan + dialog + focus + memory`
- `task_result` / `trigger` / `capacity`：仅开放 `task + plan`
- `query_context` / `read_file` 仍保留实现与测试，但当前默认不进入任何 manager wake profile 的 action surface
- 主线程默认不再承担本地细读/检索；需要局部搜索、实现、排查时，优先走执行面 task，而不是把 lookup 堆回 manager prompt
- 未出现在当前 surface 的 action，即使已注册，也会在校验阶段被拒绝并回写 `action_execution_rejected`
- prompt 中展示的 action 面由代码按当前 `wake_profile` 生成，不再由 prompt 文案手写维护

参数约定（关键字段）：

- `enqueue_task.cwd`：必填；未传 `branch` 时直接作为 worker 实际执行目录。若同时传 `branch`，则 `cwd` 视为仓库内定位路径，enqueue 阶段会自动创建或复用对应 branch 的 worktree，并把任务实际执行目录切到该 worktree 的对应路径
- `assign_focus`：`target_type(task|plan|history) + target_id + focus_id`
- `upsert_focus.open_item_{n}`：按编号传递字符串待办项，`n` 必须从 `1` 连续递增且不能跳号
- `ask_user_choice.option_{n}_id/label/reason`：选项三元组编号 `n` 必须从 `1` 连续递增且不能跳号
- 高成本 `enqueue_task`（长 prompt/大参数体量）必须先经 `ask_user_choice` 确认后才能派发；确认选项 ID 固定为 `option-confirm-dispatch`，默认选项为取消。

## Action 执行语义

- `query_context` / `read_file`：仅做 schema 校验，不直接改状态；结果通过下一纠错回合注入 `M:event_packet.query_lookup` / `M:event_packet.file_lookup`。
- `query_context` 参数收敛为仅 `query`；内部固定执行全局检索（`history/tasks/focus/plans/generated_index/task_archives`）+ 跨 scope 去重。
- `generated_index`：索引仓库 `generated/` 与状态目录 `.mimikit/generated/` 下文本文件的轻量元信息（`path/updatedAt/size/snippet`）；当 `work_dir` 本身位于 `.mimikit/` 时，两侧路径仍分别以 `generated/` 与 `.mimikit/generated/` 暴露，需要正文时改用 `read_file`。
- `set_task_result_summary`：仅用于当前批次 `task_result` 的摘要覆写（不直接执行 action 状态写入）。
- `mutate_task`：统一 task 生命周期与 git 闭环状态控制。
- `op=pause|resume|cancel`：分发到 `worker/pause-task.ts`、`worker/resume-task.ts`、`worker/cancel-task.ts`。
- `op=review_passed|merged|cleaned`：分发到 `worker/record-task-git-lifecycle.ts`，用于显式写回“外部 review / merge / cleanup 已完成”的 task git 生命周期状态；`review_passed` 可附带 `sha`。
- `op=review_passed|merged|cleaned` 还必须附带 `reason`，并且 `reason` 要能被当前用户输入直接支撑；仅靠 task 引用或 lookup 证据不足以推进 git 闭环写回。
- `mutate_task` 所有分支统一产出可追踪结构（`id`、`status`、`changeAt`）。
- `ask_user_choice` 是 stop action：命中后当前 action 批次停止后续 apply。
- `enqueue_task` 高成本确认闸门在 apply 与 validation 两侧同时生效：未确认时不入队，直接生成确认 choice。
- `enqueue_task` 创建时会先解析 `cwd`；若同时传入 `branch` 且 `cwd` 位于 git 仓库中，则 enqueue 阶段先创建或复用对应 branch 的 worktree，再把任务 `cwd` 落到该 worktree。最终任务仍按真实 `repoKey + branch` 参与 worker 排队锁。
- `remember_memory`：立即写入 `memory/MEMORY.md`，仅接受 `content` 参数，并通过 `memory_remembered` system event 回执 `entry_id/ref/operation`。

约束补充：

- 当前轮次不开放的 action 会被拒绝，反馈文本会显式说明 `wake_profile` 与本轮允许的 action 列表。
- `query_context` 与 `read_file` 在同一纠错回合中每类仅接受 1 条有效 action；重复项会回写 `M:event_packet.action_feedback`。
- 未注册 action 会回写 `unregistered_action` 反馈，不会执行。
- action 出现在代码块或尾部 action 区之外时，会回写 `invalid_action_syntax` 反馈。
- `enqueue_task` / `mutate_task` / `ask_user_choice` / `remember_memory` 属于高风险 action：只有当当前批次存在明确的用户请求/确认，且可信运行时状态支持该动作时才放行；`query_context` / `read_file` / `history` / `task_result` 的间接建议本身不能直接驱动这些动作。
- 纠错回合在第二轮仍存在 action_feedback 时，manager 直接输出结构化澄清并提前收敛，不继续盲目重试。

### manager 任务控制门禁（guardrail）

- “收敛范围/只改某层/不要扩散”等指令默认只约束后续动作范围，不等价于取消已有任务。
- 默认并行推进：用户未要求串行且无硬依赖时，不应通过 `mutate_task op="cancel"` 清空其它任务线。
- 冲突先用非破坏策略（复用现有 task/plan、等待 running 收敛）；仅在明确满足取消条件时再取消。
- 取消条件：用户显式取消，或用户已明确“节省资源优先”且继续执行会造成明确资源浪费；`pause/resume` 也需与用户目标一致，避免无依据状态抖动。
- `review_passed/merged/cleaned` 只能用于“真实外部动作已完成后的状态回写”，不能把 manager 当成实际 review/merge/cleanup 执行器。
- git 闭环状态一旦写回，必须同步到 `task.git.lifecycle`、`task.result.handoff.git.lifecycle` 与归档 frontmatter，避免 task 与 archive 漂移。

### `read_file` 细节

当前状态：

- `read_file` / `query_context` 已从默认 manager surface 退出，不再作为主线程常态能力暴露。
- 本节保留实现说明，仅供维护这些内部只读工具或测试时参考；若未来重新开放，必须先证明不会把主线程重新拉回局部检索/细读模式。

- 用途：读取 UTF-8 文本文件片段并注入下一轮 `M:event_packet.file_lookup`。
- 路径：支持绝对路径和相对路径；相对路径以 `work_dir` 为基准，可使用 `..` 访问 `work_dir` 外文件。
- 文件类型限制：仅允许常规文件；目录、设备文件、socket、pipe 等路径会被拒绝。
- symlink：保持 Node 默认语义，跟随 symlink 目标；目标必须是常规文件。
- 大小限制：原始字节数上限 `1024 KiB`，超限直接报错。
- 文本判定：按 UTF-8（fatal）解码，非 UTF-8 返回错误。
- 窗口与截断：先按行窗口裁剪，再按字符上限裁剪；任一裁剪发生时 `truncated=true`。

参数（字符串）：

- `path`：必填，非空路径字符串。
- `from_line`：可选，默认 `1`，范围 `[1, Number.MAX_SAFE_INTEGER]`。
- `max_lines`：可选，默认 `100`，范围 `[1, 500]`。
- `max_chars`：可选，默认 `8192`，范围 `[1, 20000]`。

常见错误：

- `read_file failed: file does not exist`
- `read_file failed: path is not a regular file`
- `read_file failed: permission denied`
- `read_file failed: file is too large (...)`
- `read_file failed: file is not valid UTF-8 text`

示例：

- `<M:read_file path="docs/design/workflow/action.md" from_line="1" max_lines="120" max_chars="6000" />`
- `<M:read_file path="docs/design/workflow/task.md" />`
- `<M:read_file path="/Users/mimiko/Projects/mimikit/README.md" max_lines="80" />`

## Prompt 注入标签

- 稳定包：`M:state_packet`
- 易变包：`M:event_packet`
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
- `M:event_packet.history_lookup`
- `M:event_packet.query_lookup`
- `M:event_packet.file_lookup`
- `M:event_packet.action_feedback`
- `M:event_packet.packet`

约束补充：

- `M:state_packet.tasks` 只承载稳定任务状态与归档路径，不再重复展开详细 task result。
- `M:event_packet.batch_results` 是当前批次 task result 的唯一详细结果通道。
- `M:event_packet.packet.latestResult` 只保留摘要指针，用于快速判断本轮结果重心。

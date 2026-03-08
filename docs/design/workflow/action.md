# 动作（Action）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- 本文档是 Action 领域的单一主规范（single source of truth），覆盖协议、动作清单、执行语义与参数约束。
- 涉及 Action 的设计记录、提案、简化说明仅作背景参考，不构成并行规范。
- 若与其他文档表述冲突，以本文档与对应实现代码（`src/manager/*`、`src/actions/protocol/*`）为准。

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

### 计划类

- `create_plan`
- `update_plan`
- `delete_plan`

### 任务类

- `enqueue_task`
- `mutate_task`

### 交互类

- `ask_user_choice`

### 查询类

- `query_context`
- `read_file`

### 结果处理类

- `set_task_result_summary`

### 状态写入类

- `upsert_focus`
- `assign_focus`
- `remember_memory`

参数约定（关键字段）：

- `enqueue_task.provider`：可选 `codex|opencode`；可选值应来自 `M:environment.provider_candidates`（仅包含 enabled provider）
- 未指定 `provider` 时，系统按配置自动选择：`billing` 最低优先；同档位下 `capability` 最高优先
- `assign_focus`：`target_type(task|plan|history) + target_id + focus_id`
- `upsert_focus.open_item_{n}`：按编号传递字符串待办项，`n` 必须从 `1` 连续递增且不能跳号
- `ask_user_choice.option_{n}_id/label/reason`：选项三元组编号 `n` 必须从 `1` 连续递增且不能跳号
- 高成本 `enqueue_task`（长 prompt/大参数体量）必须先经 `ask_user_choice` 确认后才能派发；确认选项 ID 固定为 `option-confirm-dispatch`，默认选项为取消。

## Action 执行语义

- `query_context` / `read_file`：仅做 schema 校验，不直接改状态；结果通过下一纠错回合注入 `M:query_lookup` / `M:file_lookup`。
- `query_context` 参数收敛为仅 `query`；内部固定执行全局检索（`history/tasks/focus/plans/generated_index/task_archives`）+ 跨 scope 去重。
- `generated_index`：仅索引 `work_dir/generated` 下文本文件的轻量元信息（`path/updatedAt/size/snippet`），需要正文时改用 `read_file`。
- `set_task_result_summary`：仅用于当前批次 `task_result` 的摘要覆写（不直接执行 action 状态写入）。
- `mutate_task`：统一 task 生命周期控制（`op=pause|resume|cancel`），按 `op` 分发到 `worker/pause-task.ts`、`worker/resume-task.ts`、`worker/cancel-task.ts`，统一产出可追踪结构（`id`、`status`、`changeAt`）。
- `ask_user_choice` 是 stop action：命中后当前 action 批次停止后续 apply。
- `enqueue_task` 高成本确认闸门在 apply 与 validation 两侧同时生效：未确认时不入队，直接生成确认 choice。
- `remember_memory`：立即写入 `memory/MEMORY.md`，仅接受 `content` 参数，并通过 `memory_remembered` system event 回执 `entry_id/ref/operation`。

补充：

- `managerFocusCompressedContexts` 字段当前仅保留结构与清理逻辑；未提供可执行 `compress_context` action，也未启用独立压缩动作链路。

约束补充：

- `query_context` 与 `read_file` 在同一纠错回合中每类仅接受 1 条有效 action；重复项会回写 `M:action_feedback`。
- 未注册 action 会回写 `unregistered_action` 反馈，不会执行。
- action 出现在代码块或尾部 action 区之外时，会回写 `invalid_action_syntax` 反馈。
- 纠错回合在第二轮仍存在 action_feedback 时，manager 直接输出结构化澄清并提前收敛，不继续盲目重试。

### manager 任务控制门禁（guardrail）

- “收敛范围/只改某层/不要扩散”等指令默认只约束后续动作范围，不等价于取消已有任务。
- 默认并行推进：用户未要求串行且无硬依赖时，不应通过 `mutate_task op="cancel"` 清空其它任务线。
- 冲突先用非破坏策略（复用现有 task/plan、等待 running 收敛）；仅在明确满足取消条件时再取消。
- 取消条件：用户显式取消，或用户已明确“节省资源优先”且继续执行会造成明确资源浪费；`pause/resume` 也需与用户目标一致，避免无依据状态抖动。

### `read_file` 细节

- 用途：读取 UTF-8 文本文件片段并注入下一轮 `M:file_lookup`。
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
- `<M:read_file path="../overflows/wt-worktree.md" />`
- `<M:read_file path="/Users/mimiko/Projects/mimikit/README.md" max_lines="80" />`

## Prompt 注入标签

- `M:inputs`
- `M:batch_results`
- `M:tasks`
- `M:plans`
- `M:focus_list`
- `M:focus_contexts`
- `M:recent_history`
- `M:query_lookup`
- `M:memory`
- `M:file_lookup`
- `M:action_feedback`

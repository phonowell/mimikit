# 动作（Action）

> 返回 [Workflow 索引](./task-and-action.md)

## 协议

协议与解析：`src/actions/protocol/*`

- Action 行格式：`<M:name key="value" />`
- 解析链路：`remark-parse` + `unist-util-visit`（无正则主解析）
- 仅解析回复尾部连续 action 区
- 参数在传输层统一字符串，manager 侧 schema 校验后执行

## Manager 消费的编排 Action

实现：`src/manager/action-registrations.ts`、`src/manager/action-validation.ts`、`src/manager/action-apply.ts`、`src/manager/loop-batch-run-manager.ts`、`src/manager/runtime-adapter.ts`、`src/history/query.ts`

### 计划类

- `create_plan`
- `update_plan`
- `delete_plan`

### 任务类

- `enqueue_task`
- `cancel_task`
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

- `assign_focus`：`target_type(task|plan|history) + target_id + focus_id`
- `upsert_focus.open_item_{n}`：按编号传递字符串待办项，`n` 必须从 `1` 连续递增且不能跳号（如 `open_item_1`、`open_item_2`）
- `ask_user_choice.option_{n}_id/label/reason`：选项三元组编号 `n` 必须从 `1` 连续递增且不能跳号

## Action 执行语义

- `query_context` / `read_file`：仅做 schema 校验，不直接改状态；同一轮每类最多 1 条，超出会返回 `M:action_feedback`；结果通过下一纠错回合注入 `M:query_lookup` / `M:file_lookup`。
- `query_context` 已统一覆盖 `task_archives` scope（不再提供独立 `query_task_archive` action）。
- `set_task_result_summary`：仅用于当前批次 `task_result` 的摘要覆写（不直接执行 action 状态写入）。
- `cancel_task`：调用 `worker/cancel-task.ts` 后统一产出可追踪结构（`id`、`status`、`changeAt`）；`id` 始终为目标任务 ID（无论 source 为 `user`/`deferred`/`system`）。
- 上下文压缩不再暴露为 manager action；仅由运行时内部触发，按 focus 维度写入压缩摘要（`managerFocusCompressedContexts`），prompt 仅注入 working focus 对应条目。
- `remember_memory`：立即写入 `memory/MEMORY.md`，仅接受 `content` 参数，并通过 `memory_remembered` system event 回执 `entry_id/ref/operation`。

### manager 取消门禁（guardrail）

- “收敛范围/只改某层/不要扩散”等指令默认只约束后续动作范围，不等价于取消已有任务。
- 默认并行推进：用户未要求串行且无硬依赖时，不应通过 `cancel_task` 清空其它任务线。
- 冲突先用非破坏策略（复用现有 task/plan、等待 running 收敛）；仅在明确满足取消条件时再取消。
- 取消条件：用户显式取消，或用户已明确“节省资源优先”且继续执行会造成明确资源浪费。

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
- `read_file failed: path is not a regular file`（含目录、设备文件、socket、pipe，或 symlink 目标非普通文件）
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

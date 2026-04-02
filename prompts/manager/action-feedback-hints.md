unregistered_action: |
  Only registered actions are allowed: {{ registered_actions }}.
invalid_action_args_empty: |
  参数格式不符合要求。
invalid_action_args_with_issues: |
  参数校验失败：{{ issues }}
invalid_iso_range_field: |
  参数校验失败：{{ field }} 必须是合法 ISO 8601 时间。
scheduled_at_invalid: |
  {{ action }} 执行失败：`scheduled_at` 不是合法 ISO 8601 时间。
scheduled_at_not_future: |
  {{ action }} 执行失败：`scheduled_at` 必须晚于当前时间（now={{ now_iso }}）。
task_control_not_found: |
  task_control 执行失败{{ task_ref_suffix }}：未找到 task ID。
task_control_resume_instructions_only: |
  task_control 执行失败{{ task_ref_suffix }}：只有 `action="resume"` 才允许附带 `instructions[]`。
task_control_already_done: |
  task_control 执行失败{{ task_ref_suffix }}：任务已完成，无法执行 {{ action }}。
task_control_already_paused: |
  task_control 执行失败{{ task_ref_suffix }}：任务已是 paused 状态。
task_control_not_paused: |
  task_control 执行失败{{ task_ref_suffix }}：任务当前不是 paused 状态，无法 resume。
task_control_already_canceled: |
  task_control 执行失败{{ task_ref_suffix }}：任务已是 canceled 状态。
enqueue_task_cwd_invalid: |
  enqueue_task 执行失败：`task.cwd` 必须指向现有目录。{{ reason }} 请提交仓库内真实执行起点，不要填写未来 worktree 路径。
enqueue_task_worktree_prepare_failed: |
  enqueue_task 执行失败：无法为 branch={{ branch }} 准备 worktree。{{ reason }} 请先修正 `cwd` 或清理冲突目录后再重试。
enqueue_task_batch_conflict: |
  enqueue_task 执行失败：默认按粗粒度派单；同一批次里多个任务命中了重叠目录：{{ conflict_paths }}。请先收敛为一个 worker 任务；只有当目录边界独立且不会互相改动时，才拆成多个 `enqueue_task`。
enqueue_task_resume_existing: |
  enqueue_task 执行失败{{ task_ref_suffix }}：当前目标已存在可安全续跑的 paused task。请改用 `task_control` + `action="resume"`，并仅在 `instructions[]` 中保留本轮新增的恢复补充；不要重新输出整份任务合同。
enqueue_task_contract_missing: |
  enqueue_task 执行失败：继续派发前还缺最小任务合同：`goal`、至少一条 `in_scope[]`、至少一条 `done_when[]`，以及有效的 `cwd/mode`。请补齐 `task` 后重试；`instructions[]` 只能作为短补充，不替代任务合同。
plan_not_found: |
  {{ action }} 执行失败：未找到 plan ID。
set_plan_done_forbidden: |
  set_plan 执行失败：done plan 不可整体替换。
duplicate_action_generic: |
  action 执行失败：重复 action。
remember_memory_not_stable: |
  remember_memory 执行失败：content 必须是可跨轮复用的单行稳定规则/偏好 digest，不能直接写任务过程文本、checklist、协议标签或 runtime 引用。当前问题：{{ reason }}。
missing_result_followup_action: |
  当前是 `task_result`-only 回合，已有明确续跑锚点（{{ continuation_anchor }}）。不要只给“建议下一步”这类说明文本；请直接输出具体 action（如 `enqueue_task` / `set_plan` / 合法的治理动作），或输出带结构化 `decision` 的 handoff / 上提判断。
stable_digest_issue_multiline: |
  包含多行文本；请收敛为单行 digest。
stable_digest_issue_checklist: |
  包含 checklist 或步骤列表。
stable_digest_issue_protocol: |
  包含协议标签或代码块。
stable_digest_issue_runtime_ref: |
  包含 task-/plan-/focus- 等运行时对象引用。
stable_digest_issue_too_long: |
  超过 240 字符上限。

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
  task_control 执行失败：未找到 task ID。
task_control_resume_instructions_only: |
  task_control 执行失败：只有 `action="resume"` 才允许附带 `instructions[]`。
task_control_already_done: |
  task_control 执行失败：任务已完成，无法执行 {{ action }}。
task_control_already_paused: |
  task_control 执行失败：任务已是 paused 状态。
task_control_not_paused: |
  task_control 执行失败：任务当前不是 paused 状态，无法 resume。
task_control_already_canceled: |
  task_control 执行失败：任务已是 canceled 状态。
record_task_git_not_found: |
  record_task_git 执行失败：未找到 task ID。
record_task_git_not_done: |
  record_task_git 执行失败：任务尚未完成，无法写入 {{ state }}。
record_task_git_not_git: |
  record_task_git 执行失败：任务没有 git 执行上下文，无法写入 {{ state }}。
record_task_git_review_required: |
  record_task_git 执行失败：任务尚未记录 review passed，无法写入 merged。
record_task_git_merge_required: |
  record_task_git 执行失败：任务尚未记录 merged，无法写入 cleaned。
record_task_git_reason_required: |
  record_task_git 执行失败：必须提供变更原因。
enqueue_task_cwd_invalid: |
  enqueue_task 执行失败：`task.cwd` 必须指向现有目录。{{ reason }} 请提交仓库内真实执行起点，不要填写未来 worktree 路径。
enqueue_task_worktree_prepare_failed: |
  enqueue_task 执行失败：无法为 branch={{ branch }} 准备 worktree。{{ reason }} 请先修正 `cwd` 或清理冲突目录后再重试。
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

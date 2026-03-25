unregistered_action: |
  Only registered actions are allowed: {{ registered_actions }}.
invalid_action_syntax: |
  Detected M:action markup but no executable action was parsed. Put valid XML actions at the end of the reply (not in code blocks), and make sure tags/quotes are closed correctly.
action_in_code_block: |
  Detected M:action inside a code block, so it cannot be executed. Place actions at the end of the reply without code fences.
invalid_action_args_empty: |
  参数格式不符合要求。
invalid_action_args_with_issues: |
  参数校验失败：{{ issues }}
invalid_iso_range_field: |
  参数校验失败：{{ field }} 必须是合法 ISO 8601 时间。
scheduled_at_invalid: |
  {{ action }} 执行失败：scheduled_at 不是合法 ISO 8601 时间。
scheduled_at_not_future: |
  {{ action }} 执行失败：scheduled_at 必须晚于当前时间（now={{ now_iso }}）。
mutate_task_not_found: |
  mutate_task 执行失败：未找到 task ID。
mutate_task_already_done: |
  mutate_task 执行失败：任务已完成，无法执行 {{ op }}。
mutate_task_already_paused: |
  mutate_task 执行失败：任务已是 paused 状态。
mutate_task_not_paused: |
  mutate_task 执行失败：任务当前不是 paused 状态，无法 resume。
mutate_task_resume_instruction_invalid: |
  mutate_task 执行失败：`resume_instruction` 只能与 `op="resume"` 一起使用，且内容应是本次恢复的一次性补充说明。
mutate_task_already_canceled: |
  mutate_task 执行失败：任务已是 canceled 状态。
restart_runtime_unavailable: |
  restart_runtime 执行失败：当前 runtime 未暴露重启出口，不能由 manager 直接发起重启。
restart_runtime_busy: |
  restart_runtime 执行失败：当前仍有 pending/running worker task，需等待执行面清空后再重启。
restart_runtime_already_scheduled: |
  restart_runtime 执行失败：重启已在排队，不要重复发起。
mutate_task_git_reason_required: |
  mutate_task 执行失败：{{ op }} 必须附带 `reason`，并用一句话明确引用用户已经确认的 review/merge/cleanup 动作。
mutate_task_not_done_for_git: |
  mutate_task 执行失败：任务尚未完成，无法写入 {{ op }}。
mutate_task_not_git: |
  mutate_task 执行失败：任务没有 git 执行上下文，无法写入 {{ op }}。
mutate_task_review_required: |
  mutate_task 执行失败：任务尚未记录 review passed，无法写入 merged。
mutate_task_merge_required: |
  mutate_task 执行失败：任务尚未记录 merged，无法写入 cleaned。
ask_user_choice_channel_unsupported: |
  ask_user_choice 执行失败：当前批次来源包含不支持回传选项的渠道输入（Telegram/Feishu），请改为纯文本提问并列出候选项。
ask_user_choice_invalid_options: |
  ask_user_choice 执行失败：option_{n}_id/label/reason 参数非法（n 必须从 1 连续递增且不能跳号），或 default_option_id 不在 options 中。
enqueue_task_worktree_prepare_failed: |
  enqueue_task 执行失败：无法为 branch={{ branch }} 准备 worktree。{{ reason }} 请先修正 `cwd` / `branch` 或清理冲突目录后再重试。
enqueue_task_contract_missing: |
  enqueue_task 执行失败：继续派发前还缺 3 个最小信息，每项一句即可：goal（最终要什么结果）、in_scope/out_of_scope（这次做什么、哪些不做）、至少一条 done_when_{n}（怎样算完成）。
  请补齐 contract 后重试；`worker_prompt` 可省略，省略时系统会按 contract 自动生成。
plan_not_found: |
  {{ action }} 执行失败：未找到 plan ID。
update_plan_done_forbidden: |
  update_plan 执行失败：done plan 不可修改。
duplicate_action_generic: |
  action 执行失败：重复 action。
remember_memory_not_stable: |
  remember_memory 执行失败：content 必须是可跨轮复用的单行稳定规则/偏好 digest，不能直接写任务过程文本、checklist、协议标签或 runtime 引用。当前问题：{{ reason }}。
set_task_result_summary_task_not_in_batch: |
  set_task_result_summary 执行失败：task_id 不在当前批次结果中。{{ available_hint }}

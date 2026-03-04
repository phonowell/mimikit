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
cancel_task_not_found: |
  cancel_task 执行失败：未找到可取消的任务 ID。
cancel_task_already_canceled: |
  cancel_task 执行失败：任务已是 canceled 状态。
cancel_task_not_cancelable: |
  cancel_task 执行失败：任务已完成，无法取消。
compress_context_unavailable: |
  compress_context 执行失败：当前无可压缩上下文。
ask_user_choice_qq_unsupported: |
  ask_user_choice 执行失败：当前批次来源包含 QQ 单聊输入，QQ 链路不支持选项回传。
ask_user_choice_invalid_options: |
  ask_user_choice 执行失败：option_{n}_id/label/reason 参数非法，或 default_option_id 不在 options 中。
plan_not_found: |
  {{ action }} 执行失败：未找到 plan ID。
update_plan_done_forbidden: |
  update_plan 执行失败：done plan 不可修改。

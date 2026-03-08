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
mutate_task_already_canceled: |
  mutate_task 执行失败：任务已是 canceled 状态。
ask_user_choice_channel_unsupported: |
  ask_user_choice 执行失败：当前批次来源包含不支持回传选项的渠道输入（Telegram/Feishu），请改为纯文本提问并列出候选项。
ask_user_choice_invalid_options: |
  ask_user_choice 执行失败：option_{n}_id/label/reason 参数非法（n 必须从 1 连续递增且不能跳号），或 default_option_id 不在 options 中。
enqueue_task_provider_disabled: |
  enqueue_task 执行失败：provider={{ provider }} 当前未启用。请改用已注入到 M:environment 的 provider_candidates。
enqueue_task_contract_missing: |
  enqueue_task 执行失败：缺少 task contract。请补充 goal、scope 与至少一条 acceptance_{n}（例如 acceptance_1）。
  请直接改成下面格式后重试：
  <M:enqueue_task prompt="{{ prompt }}" title="{{ title }}" goal="{{ goal }}" scope="{{ scope }}" acceptance_1="{{ acceptance_1 }}" />
plan_not_found: |
  {{ action }} 执行失败：未找到 plan ID。
update_plan_done_forbidden: |
  update_plan 执行失败：done plan 不可修改。
duplicate_query_context_action_limit: |
  query_context 执行失败：同一轮最多保留一个 query_context action；请先合并查询目标。
duplicate_read_file_action_limit: |
  read_file 执行失败：同一轮最多保留一个 read_file action；请先合并读取范围。
duplicate_action_generic: |
  action 执行失败：重复 action。
set_task_result_summary_task_not_in_batch: |
  set_task_result_summary 执行失败：task_id 不在当前批次结果中。{{ available_hint }}

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
enqueue_task_requires_confirmation: |
  enqueue_task 执行失败：当前任务为高成本长任务，必须先通过 ask_user_choice 生成待确认项，再由用户返回后决定是否派发。请先输出 ask_user_choice，并将 default_option_id 设为取消项。
enqueue_task_worktree_prepare_failed: |
  enqueue_task 执行失败：无法为 branch={{ branch }} 准备 worktree。{{ reason }} 请先修正 `cwd` / `branch` 或清理冲突目录后再重试。
enqueue_task_contract_missing: |
  enqueue_task 执行失败：继续派发前还缺 3 个最小信息，每项一句即可：goal（最终要什么结果）、in_scope/out_of_scope（这次做什么、哪些不做）、至少一条 done_when_{n}（怎样算完成）。
  可以直接改成下面格式后重试；`worker_prompt` 可省略，省略时系统会按 contract 自动生成：
  <M:enqueue_task worker_prompt="{{ worker_prompt }}" title="{{ title }}" cwd="{{ cwd }}" goal="{{ goal }}" in_scope="{{ in_scope }}" out_of_scope="{{ out_of_scope }}" done_when_1="{{ done_when_1 }}" />
enqueue_task_contract_missing_default_worker_prompt: |
  按 contract 自动生成可省略；如需显式指定，可写给 worker 的执行指令
enqueue_task_contract_missing_default_title: |
  补全任务契约并执行
enqueue_task_contract_missing_default_cwd: |
  /absolute/path/to/workspace
enqueue_task_contract_missing_default_goal: |
  完成用户请求的可交付结果
enqueue_task_contract_missing_default_in_scope: |
  只覆盖这次要完成的最小交付范围
enqueue_task_contract_missing_default_out_of_scope: |
  不改无关模块，不做顺手重构
enqueue_task_contract_missing_default_done_when_1: |
  结果可直接验证，例如命令通过或页面行为符合预期
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

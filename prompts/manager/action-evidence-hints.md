enqueue_task_intent_evidence_missing: |
  enqueue_task 执行失败：intent-evidence guard 未通过。当前只有 {{ evidence_sources }} 等补充证据，缺少来自当前用户输入的直接任务意图。请先让用户明确目标、范围和验收；若本轮没有新增用户意图，就停止派发并等待授权。
task_control_intent_evidence_missing: |
  task_control 执行失败：intent-evidence guard 未通过。当前只有 {{ evidence_sources }} 等补充证据，缺少来自当前用户输入的直接任务控制意图。请先让用户明确引用 task id/title（当前目标：{{ task_ref }}）并确认要执行的动作（当前需要：{{ required_action }}）后再重试。
set_plan_intent_evidence_missing: |
  set_plan 执行失败：intent-evidence guard 未通过。当前只有 {{ evidence_sources }} 等补充证据，缺少来自当前用户输入的直接计划意图。请先让用户明确引用目标 plan id/title，并说明这是创建新计划还是更新现有计划；若是创建新计划，再补充触发方式和任务内容后重试。
dialog_action_source_input_missing: |
  {{ action_name }} 执行失败：source_input_id 必须命中当前轮真实用户输入。
dialog_action_source_quote_missing: |
  {{ action_name }} 执行失败：source_quote 必须命中当前轮真实用户输入。
dialog_action_source_quote_unanchored: |
  {{ action_name }} 执行失败：source_quote 必须是当前轮用户输入中的原文片段。

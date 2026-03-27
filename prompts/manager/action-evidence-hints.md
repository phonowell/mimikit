enqueue_task_intent_evidence_missing: |
  enqueue_task 执行失败：intent-evidence guard 未通过。当前可见证据包含 {{ evidence_sources }} 等补充信息，但缺少来自当前用户输入的直接任务意图证据，不能把这些建议直接派发成新任务。请先让用户明确目标、范围和验收；若当前没有新增用户意图，就停止派发并等待更直接的指令证据。
task_control_intent_evidence_missing: |
  task_control 执行失败：intent-evidence guard 未通过。当前可见证据包含 {{ evidence_sources }} 等补充信息，但缺少来自当前用户输入的直接任务控制证据。请先让用户明确引用 task id/title（当前目标：{{ task_ref }}）并确认要执行的控制动作（当前需要：{{ required_action }}）后再重试。
record_task_git_intent_evidence_missing: |
  record_task_git 执行失败：intent-evidence guard 未通过。当前可见证据包含 {{ evidence_sources }} 等补充信息，但缺少来自当前用户输入的直接 git 闭环写回证据。请先让用户明确引用 task id/title（当前目标：{{ task_ref }}）并确认要写回的状态（当前需要：{{ required_action }}）后再重试。
set_plan_intent_evidence_missing: |
  set_plan 执行失败：intent-evidence guard 未通过。当前可见证据包含 {{ evidence_sources }} 等补充信息，但缺少来自当前用户输入的直接计划意图证据。请先让用户明确“何时触发、要派发什么任务”后再重试。

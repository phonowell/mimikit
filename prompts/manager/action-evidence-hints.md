enqueue_task_intent_evidence_missing: |
  enqueue_task 执行失败：intent-evidence guard 未通过。当前只有 {{ evidence_sources }} 等补充证据，缺少来自当前用户输入的直接任务意图。请先让用户明确目标、范围和验收；若本轮没有新增用户意图，就停止派发并等待授权。
task_control_intent_evidence_missing: |
  task_control 执行失败：intent-evidence guard 未通过。当前只有 {{ evidence_sources }} 等补充证据，缺少来自当前用户输入的直接任务控制意图。请先让用户明确引用 task id/title（当前目标：{{ task_ref }}）并确认要执行的动作（当前需要：{{ required_action }}）后再重试。
record_task_git_intent_evidence_missing: |
  record_task_git 执行失败：intent-evidence guard 未通过。当前只有 {{ evidence_sources }} 等补充证据，缺少来自当前用户输入的直接 git 闭环写回意图。请先让用户明确引用 task id/title（当前目标：{{ task_ref }}）并确认要写回的状态（当前需要：{{ required_action }}）后再重试。
set_plan_intent_evidence_missing: |
  set_plan 执行失败：intent-evidence guard 未通过。当前只有 {{ evidence_sources }} 等补充证据，缺少来自当前用户输入的直接计划意图。请先让用户明确何时触发、要派发什么任务，再重试。

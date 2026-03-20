enqueue_task_intent_evidence_missing: |
  enqueue_task 执行失败：intent-evidence guard 未通过。当前可见证据包含 {{ evidence_sources }} 等补充信息，但缺少来自当前用户输入的直接任务意图证据，不能把这些建议直接派发成新任务。请先让用户明确目标/范围/验收，或继续使用只读 lookup 补证后再重试。
mutate_task_intent_evidence_missing: |
  mutate_task 执行失败：intent-evidence guard 未通过。当前可见证据包含 {{ evidence_sources }} 等补充信息，但缺少来自当前用户输入的直接任务控制证据。请先让用户明确引用 task id/title（当前目标：{{ task_ref }}）并确认要执行的控制动作后再重试。
ask_user_choice_intent_evidence_missing: |
  ask_user_choice 执行失败：intent-evidence guard 未通过。当前可见证据包含 {{ evidence_sources }} 等补充信息，但缺少来自当前用户输入的直接决策意图证据。请先澄清用户真实目标，或直接说明当前不确定性边界，不要基于补充材料自行制造确认项。
remember_memory_intent_evidence_missing: |
  remember_memory 执行失败：intent-evidence guard 未通过。当前可见证据包含 {{ evidence_sources }} 等补充信息，但缺少来自当前用户输入的直接“要求记住该偏好/约束”的证据。请先让用户明确确认后再写入长期记忆。

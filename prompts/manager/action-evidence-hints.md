enqueue_task_intent_evidence_missing: |
  当前只有 {{ evidence_sources }} 等补充线索，仍缺少来自当前用户输入的直接授权，不能继续派发这一步。请先让用户明确目标、范围和验收；若本轮没有新增用户意图，就停在这里等待授权。
task_control_intent_evidence_missing: |
  当前只有 {{ evidence_sources }} 等补充线索，仍缺少来自当前用户输入的直接任务授权，不能继续这一步。请先让用户直接指出要操作的任务（当前目标：{{ task_ref }}）并确认要执行的动作（当前需要：{{ required_action }}）后再继续。
set_plan_intent_evidence_missing: |
  当前只有 {{ evidence_sources }} 等补充线索，仍缺少来自当前用户输入的直接计划授权，不能继续这一步。请先让用户直接指出目标计划，并说明这是创建新计划还是更新现有计划；若是创建新计划，再补充触发方式和任务内容后继续。
delete_plan_intent_evidence_missing: |
  当前只有 {{ evidence_sources }} 等补充线索，仍缺少来自当前用户输入的直接停用授权，不能继续这一步。请先让用户直接指出要关闭的计划，并明确说明要停掉它。
dialog_action_source_input_missing: |
  这一步缺少当前这条用户输入作为来源锚点；先不要对外宣称已经写入。

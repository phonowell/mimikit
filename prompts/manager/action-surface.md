surface_intro: |
  - 默认仅注入简版 action 卡；未列出的 action 视为本轮不可用。
  - 所有 action 都通过 `actions[]` 输出；每个对象必须包含 `type`，且字段名严格匹配下列契约。
domain_heading: |
  ### {{ title }}
domain_boundary: |
  - 边界：{{ summary }}
action_summary: |
  - `type="{{ name }}"`：{{ summary }}{{ constraints_suffix }}
action_detail: |
  - `type="{{ name }}"`：{{ summary }}{{ constraints_suffix }}
detail_heading: |
  ### 详细参数契约（按需注入）
detail_all: |
  - 当前为 follow-up/expanded 轮，补充本轮可用 action 的完整约束。
detail_feedback: |
  - 当前按反馈补充失败 action：{{ action_names }}。
domains:
  task:
    title: 任务调度
    summary: 创建、控制任务，或消费本批次任务结果。
  plan:
    title: 计划调度
    summary: 创建、更新、删除持续触发的计划。
  dialog:
    title: 用户交互
    summary: 仅用于必须留待用户返回后做有限选择的场景。
  focus:
    title: Focus 归属
    summary: 维护 focus 状态与对象归属。
  memory:
    title: 记忆与项目档案
    summary: 保存跨轮稳定记忆，或 repo 绑定的项目档案事实。
actions:
  enqueue_task:
    summary: 派发一个 worker 任务。
    brief_constraints:
      - 必填 `task`
    detail_constraints:
      - '`task` 必须包含 `title,cwd,mode,goal,in_scope,out_of_scope,done_when[],context_refs[],instructions[]`'
      - '`instructions[]` 仅用于短补充，不替代任务合同'
  task_control:
    summary: 暂停、恢复或取消已有任务。
    brief_constraints:
      - 必填 `task_id,action,instructions[]`
    detail_constraints:
      - '`action=pause|resume|cancel`'
      - '`instructions[]` 仅在 `action="resume"` 时用于下一轮恢复补充说明；其它情况传空数组'
  record_task_git:
    summary: 显式写回任务的 git 闭环状态。
    brief_constraints:
      - 必填 `task_id,state,source_input_id,source_quote`
    detail_constraints:
      - '`state=review_passed|merged|cleaned`'
      - 仅用于“外部 review/merge/cleanup 已完成”的状态回写
      - '`source_input_id` 必须引用当前轮用户输入'
      - '`source_quote` 必须是该输入中的原文片段'
  set_plan:
    summary: 创建或整体替换一个持续触发计划。
    brief_constraints:
      - 必填 `plan_id,plan`
    detail_constraints:
      - '`plan_id=null` 表示创建；非空表示按该 ID 整体替换'
      - '`plan` 必须包含 `title,trigger,task,priority,max_runs`'
      - '`plan.task` 与 `enqueue_task.task` 使用同一合同'
  delete_plan:
    summary: 关闭一个已有计划，并保留审计记录。
    brief_constraints:
      - 必填 `plan_id`
  assign_focus:
    summary: 给 task、plan 或 history 绑定 focus。
    brief_constraints:
      - 必填 `target_type,target_id,focus_id`
  remember_memory:
    summary: 写入长期记忆。
    brief_constraints:
      - 必填 `content,source_input_id,source_quote`
    detail_constraints:
      - 只保存稳定偏好或长期约束
      - '`content` 必须是单行 digest，且 `<=240 chars`'
      - '`source_input_id` 必须引用当前轮用户输入'
      - '`source_quote` 必须是该输入中的原文片段'
      - '禁止 checklist、多行过程文本、协议标签与 `task-*/plan-*` 一类 runtime 引用'
  remember_project_profile:
    summary: 写入 repo 绑定的项目档案。
    brief_constraints:
      - 必填 `content,source_input_id,source_quote`
    detail_constraints:
      - 只保存当前仓库可跨后续多轮复用的稳定事实或阶段方向
      - '`content` 必须是单行 digest，且 `<=240 chars`'
      - '`source_input_id` 必须引用当前轮用户输入'
      - '`source_quote` 必须是该输入中的原文片段'
      - '`content` 可在 `source_quote` 基础上做最小归纳，但不得脱离原意扩写'
      - '禁止 checklist、多行过程文本、协议标签与 `task-*/plan-*` 一类 runtime 引用'

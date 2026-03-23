surface_intro: |
  - 当前 wake_profile=`{{ wake_profile }}`；默认仅注入简版 action 卡，未列出的 action 视为本轮不可用。
domain_heading: |
  ### {{ title }}
domain_boundary: |
  - 边界：{{ summary }}
action_summary: |
  - `M:{{ name }}`：{{ summary }}{{ constraints_suffix }}
action_detail: |
  - `M:{{ name }}`：{{ summary }}{{ constraints_suffix }}
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
    title: 长期记忆
    summary: 仅保存跨轮稳定生效的偏好或约束。
actions:
  enqueue_task:
    summary: 派发一个 worker 任务。
    brief_constraints:
      - 必填 `title,cwd,goal,in_scope,done_when_1`
    detail_constraints:
      - '`worker_prompt` 可省略并由系统按 contract 自动生成'
      - 可选 `branch,out_of_scope,context_ref_{1..3},focus_id`
      - 提供 `branch` 后 enqueue 阶段会自动创建或复用对应 worktree，并把任务 `cwd` 切到该 worktree
      - 默认一个目标只创建一个任务
  mutate_task:
    summary: 暂停、恢复、取消任务，或写回 git 闭环状态。
    brief_constraints:
      - 必填 `id,op`
    detail_constraints:
      - '`op=pause|resume|cancel|review_passed|merged|cleaned`'
      - '`review_passed` 可选 `sha`'
  restart_runtime:
    summary: 在当前 batch 收尾后请求运行时自重启。
    brief_constraints:
      - 必填 `reason`
    detail_constraints:
      - 仅在没有 pending/running worker task 时可用
      - 命中后当前 action 批次停止后续 apply
      - '`reason` 必须直接对应当前用户请求的更新/重启意图'
  set_task_result_summary:
    summary: 为当前批次 `task_result` 写摘要。
    brief_constraints:
      - 必填 `task_id,summary`
    detail_constraints:
      - 仅能引用当前批次可见结果
  create_plan:
    summary: 创建一个持续触发的计划。
    brief_constraints:
      - 必填 `title,schedule_type,effect_kind`
    detail_constraints:
      - 可选 `focus_id,priority,max_runs`
  update_plan:
    summary: 更新已有计划的触发器或 effect。
    brief_constraints:
      - 必填 `id`
  delete_plan:
    summary: 关闭一个已有计划，并保留审计记录。
    brief_constraints:
      - 必填 `id`
  ask_user_choice:
    summary: 生成一个待用户返回后处理的有限选择。
    brief_constraints:
      - 必填 `id,question,default_option_id` 与连续的 `option_n_{id,label,reason}`
    detail_constraints:
      - 仅在有限候选且确需用户决策时使用
      - '`telegram`/`feishu` 来源不可用'
  upsert_focus:
    summary: 创建或更新 focus 状态。
    brief_constraints:
      - 必填 `id`
    detail_constraints:
      - 可选 `title,status,summary`
      - '`open_item_n` 必须连续编号'
  assign_focus:
    summary: 给 task、plan 或 history 绑定 focus。
    brief_constraints:
      - 必填 `target_type,target_id,focus_id`
  remember_memory:
    summary: 写入长期记忆。
    brief_constraints:
      - 仅支持 `content`
    detail_constraints:
      - 只保存稳定偏好或长期约束
      - '`content` 必须是单行 digest，且 `<=240 chars`'
      - '禁止 checklist、多行过程文本、协议标签与 `task-*/plan-*` 一类 runtime 引用'

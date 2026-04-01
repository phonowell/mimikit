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
      - 必填 `task.use_worktree`
    detail_constraints:
      - '`task` 必须包含 `title,cwd,mode,use_worktree,goal,in_scope,out_of_scope,done_when[],context_refs[],instructions[]`'
      - '`goal/in_scope/out_of_scope/done_when/instructions` 默认 1-3 条高密度短句，避免同义重复、客套和多段解释'
      - '若单条 `goal/in_scope/out_of_scope/done_when/context_refs/instructions` 因 `；` 分句过长，优先删减末尾次要 clause，不要拆出兼容别名或额外字段'
      - '`task` 整体预算应控制在 `<=900 chars` / `UTF-8 <=2700 bytes`；优先删减重复 scope/acceptance，再删减次要 `context_refs` 与 `instructions`'
      - '不要镜像历史 task/plan 的完整 verbose contract；只保留当前任务最小可执行合同'
      - '系统只接受当前结构化合同；旧别名、隐藏默认值和兼容字段都无效'
      - '`instructions[]` 仅用于短补充，不替代任务合同'
      - '能沿用同一 paused task 时，优先改用 `task_control` 的 `resume`，不要重复输出整份新合同'
      - '`use_worktree=false` 表示直接在给定 `cwd` 执行；`true` 仅用于需要独立 git worktree/review/merge/cleanup 闭环的 `mode="write"` 仓库任务'
      - '同一轮默认只派发一个粗粒度 `enqueue_task`；只有在目录边界独立且互不冲突时才拆成多个任务'
  task_control:
    summary: 暂停、恢复或取消已有任务。
    brief_constraints:
      - 必填 `task_id,action`
    detail_constraints:
      - '`action=pause|resume|cancel`'
      - '`instructions[]` 仅在 `action="resume"` 时可选附带，用于下一轮恢复补充说明'
  set_plan:
    summary: 创建或整体替换一个持续触发计划。
    brief_constraints:
      - 必填 `plan_id,plan`
      - '`plan_id=null` 表示创建；非空表示按该 ID 整体替换'
    detail_constraints:
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

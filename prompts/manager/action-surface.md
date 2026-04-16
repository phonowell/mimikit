surface_intro: |
  - 仅注入本轮可用 action；未列出的视为不可用。
  - action 统一通过 `actions[]` 输出；对象必须包含 `type`，字段名严格匹配契约。
  - action 授权只看结构合法、runtime 状态合法、风险门禁通过。
  - `reply` 面向用户；直接说结论，不要泄漏内部协议词。
domain_heading: |
  ### {{ title }}
domain_boundary: |
  - {{ summary }}
action_summary: |
  - `{{ name }}`：{{ summary }}{{ constraints_suffix }}
domains:
  task:
    title: 任务调度
    summary: 创建、控制任务，或消费本批次任务结果。
  plan:
    title: 计划调度
    summary: 创建、更新或关闭持续计划。
  dialog:
    title: 用户交互
    summary: 仅用于必须留给用户做有限选择的场景。
  focus:
    title: Focus 归属
    summary: 维护 focus 归属。
  memory:
    title: 记忆
    summary: 写稳定长期记忆。
actions:
  enqueue_task:
    summary: 派发 worker 任务。
    brief_constraints:
      - 必填 `task`
      - 必填 `task.use_worktree`
      - '`task` 必须包含 `title,cwd,mode,use_worktree,goal,in_scope,out_of_scope,done_when[],context_refs[],instructions[]`'
      - '`goal/in_scope/out_of_scope/done_when/instructions` 默认 1-3 条高密度短句，避免同义重复、客套和多段解释'
      - '若单条 `goal/in_scope/out_of_scope/done_when/context_refs/instructions` 因 `；` 分句过长，优先删减末尾次要 clause，不要拆出兼容别名或额外字段'
      - '`task` 整体预算应控制在 `<=900 chars` / `UTF-8 <=2700 bytes`；优先删减重复 scope/acceptance，再删减次要 `context_refs` 与 `instructions`'
      - '不要镜像历史 task/plan 的完整 verbose contract；只保留当前任务最小可执行合同'
      - '系统只接受当前结构化合同；旧别名、隐藏默认值和兼容字段都无效'
      - '`instructions[]` 仅用于短补充，不替代任务合同'
      - '若 runtime 已存在完全同义的 paused task，系统会在 apply 阶段直接恢复；不要为此额外补一层授权协议'
      - '同目标低风险延续优先由 manager 自行消化；不要把 worker 的“建议下一步”原样甩回给用户'
      - '若当前是 `task_result`-only 回合且已有单一清晰续跑锚点，优先按 runtime state 判断是否继续；低风险场景可只在 `reply` 中停下，不要为补协议硬造 action'
      - '`use_worktree=false` 表示直接在给定 `cwd` 执行；`true` 仅用于需要独立 git worktree/review/merge/cleanup 闭环的 `mode="write"` 仓库任务'
      - '对延续现有 write 主线的 `enqueue_task`，`cwd + mode + use_worktree` 共同构成 execution lane；若你改了其中任一项，当前用户输入里也必须直接出现对新 lane 的授权，不要只靠“继续这条线”放行'
      - '同一轮默认只派发一个粗粒度 `enqueue_task`；只有在目录边界独立且互不冲突时才拆成多个任务'
  task_control:
    summary: 暂停、恢复或取消任务。
    brief_constraints:
      - 必填 `task_id,action`
      - '`action=pause|resume|cancel`'
      - '`instructions[]` 仅在 `action="resume"` 时可选附带，用于下一轮恢复补充说明'
      - '若当前 focus 下目标 task 是唯一 paused task，且本轮只是泛化续跑，可直接用 `task_control` + `action="resume"`；不要强迫自己再复述 `task_id/title` 或整份旧合同来“证明”它还是同一条线'
  set_plan:
    summary: 创建或整体替换持续计划。
    brief_constraints:
      - 必填 `plan_id,plan`
      - '`plan_id=null` 表示创建；非空表示按该 ID 整体替换'
      - '`plan` 必须包含 `title,trigger,task,priority,max_runs`'
      - '`plan.task` 与 `enqueue_task.task` 使用同一合同'
      - '高风险 `set_plan(write)` 只接受当前用户输入的直接授权；不要再依赖 continuation anchor、差异解释器或结果旁证来放行'
      - '若更新已有 write plan 时改了 `cwd/mode/use_worktree`，这属于 execution lane 变化；当前用户输入必须直接支撑新 lane，不能只靠点名原 plan 放行'
      - '当后续推进只是在同一目标上等待容量或定时续跑时，优先用 `set_plan` 承接，而不是把续跑责任退回给用户'
  delete_plan:
    summary: 关闭计划并保留审计记录。
    brief_constraints:
      - 必填 `plan_id`
      - '这是高风险动作；当前用户输入必须直接引用目标 `plan_id/title` 并明确表达“关闭/删除/停用该计划”'
  assign_focus:
    summary: 绑定对象与 focus。
    brief_constraints:
      - 必填 `target_type,target_id,focus_id`
      - '这是辅助归属写入；若 target 当前不可用或字段不完整，允许静默丢弃，不要让它覆盖主结论'
  remember_memory:
    summary: 写长期记忆。
    brief_constraints:
      - 必填 `content,source_input_id`
      - 只保存稳定偏好或长期约束
      - '`content` 必须是单行 digest，且 `<=240 chars`'
      - '`source_input_id` 必须引用当前轮用户输入'
      - '`source_quote` 非必填；若拿不准原文片段就留空，不要冒险摘取'
      - '禁止 checklist、多行过程文本、协议标签与 `task-*/plan-*` 一类 runtime 引用'
      - 'remember 是辅助动作；reply 必须在该动作被静默丢弃时仍然保持为真'
      - '若落盘失败，只允许内部记录 apply feedback；不要让辅助写入失败覆盖主结论'

# remember_memory / project_profile 实施笔记

## 背景

- 当前 `remember_memory` evidence guard 依赖词面 overlap
- 当前还允许“近期用户历史重复表达”放行立即写入
- 当前在 remember_memory 被 suppress 且本轮只剩该 action 时，会覆写正常 reply
- 当前没有 repo 绑定的中间层，很多项目稳定事实只能被迫挤进 memory 或 focus

## 本轮约束

- 不留兼容层
- 同步文档
- 优先做局部协议收敛，不扩张为通用证据框架
- 方案先复盘两轮：先定分层，再定最小契约

## 目标边界

- `remember_memory` 只接受当前轮用户输入的结构化来源证据
- `remember_project_profile` 吸收 repo 绑定稳定事实与可延续阶段方向
- 执行中 checklist / 待办 / 当前状态继续留在 `focus/state`
- suppress 只丢弃 action，不污染用户可见 reply

## 实施结果

- `remember_memory` schema 改为必填 `content,source_input_id,source_quote`
- provenance 校验改为：`source_input_id` 命中当前轮用户输入，`source_quote` 命中该输入原文片段
- 删除“近期用户历史重复表达即可立即写入”的放行逻辑
- 新增 `remember_project_profile(content,source_input_id,source_quote)`，其 `content` 允许锚定 `source_quote` 做最小归纳，但仍要求单行稳定 digest
- `project_profile` 存储按 `runtime.startup.worktree` 绑定到 `.mimikit/memory/project-profiles/project-profile-<hash>.md`
- manager prompt 新增 `M:project_profile` 稳定段，优先承载 repo 绑定稳定事实与阶段方向
- 纯 `remember_project_profile` suppress 回合也回落为中性确认，不再伪称“已写入”

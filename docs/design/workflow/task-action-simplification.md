# Task Action Simplification

> 历史记录文档。当前实现已被 `actions v2` 协议取代，请以 [action.md](./action.md) 为准。

## 当前结论

- `mutate_task` 已拆分为：
  - `task_control`
  - `record_task_git`
- `create_plan / update_plan` 已合并为 `set_plan`
- `upsert_focus`、`restart_runtime`、`set_task_result_summary` 已从 manager action surface 删除
- `worker_prompt`、`branch`、`*_1` 编号参数已删除

本文不再维护细节，只保留迁移背景说明。

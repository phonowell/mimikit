# Task Action 收敛设计（pause/resume）

> 范围：manager action 设计收敛（不含本文件内实现代码变更）

## 1. 背景与问题

当前 task 控制路径已具备运行时能力：

- 创建：`enqueue_task`
- 控制：worker/HTTP 已支持 `pause`、`resume`、`cancel`

若在 manager 层继续按“一个能力一个 action”新增 `pause_task`、`resume_task`，会出现：

- task action 表面积扩大，提示词白名单和约束同步成本上升
- manager 输出 action 时决策分支增多，`action_feedback` 风险增加
- 文档分类中 `ask_user_choice` 与 task lifecycle 混放，心智模型不清晰

## 2. 目标

- 增加 manager 对 task `pause/resume` 的编排能力
- 不增加 task action 心智负担，保持最小可解释模型
- 统一 task 控制动作的校验、执行和错误语义

## 3. 目标模型（V2）

保留 2 个 task 相关 action：

- `enqueue_task`：只负责“创建并入队”
- `mutate_task`：统一负责“生命周期控制”

`cancel_task` 在 V2 中移除，不保留兼容层。

## 4. Action 契约

### 4.1 `enqueue_task`（保持不变）

- 必填：`prompt`、`title`
- 可选：`focus_id`

### 4.2 `mutate_task`（新增）

- 必填：`id`、`op`
- 可选：`reason`
- `op` 枚举：`pause | resume | cancel`

示例：

- `<M:mutate_task id="task-123" op="pause" reason="wait for user confirmation" />`
- `<M:mutate_task id="task-123" op="resume" />`
- `<M:mutate_task id="task-123" op="cancel" reason="superseded" />`

## 5. 状态转移语义

| op | 允许输入状态 | 输出状态 | 非法状态错误 |
| --- | --- | --- | --- |
| pause | `pending`、`running` | `paused` | `already_paused` / `already_done` |
| resume | `paused` | `pending` | `not_paused` / `already_done` |
| cancel | `pending`、`paused`、`running` | `canceled` | `already_canceled` / `already_done` |

通用错误：`not_found`、`invalid`。

## 6. Manager 执行层设计

### 6.1 校验层

在 `action-validation` 中新增 `validateMutateTask`：

- 先做 schema 校验（`id` 非空、`op` 在枚举中）
- 再用 `taskStatusById` 做状态机校验
- 错误提示按 `op` 生成最小修复 hint

### 6.2 应用层

在 `action-registry-definitions` 中新增 `mutate_task`，按 `op` 分发：

- `pause` -> `pauseTask(runtime, id, { source: 'deferred', reason })`
- `resume` -> `resumeTask(runtime, id, { source: 'deferred', reason })`
- `cancel` -> `cancelTask(runtime, id, { source: 'deferred', reason })`

## 7. 文档与 Prompt 收敛

- Action 分类改为：
- 任务创建：`enqueue_task`
- 任务控制：`mutate_task`
- 交互决策：`ask_user_choice`

- `prompts/manager/system.md`：
- 白名单移除 `cancel_task`，新增 `mutate_task`
- 最小约束新增 `mutate_task(id, op[, reason])`
- “取消门禁”文本改为“任务控制门禁”（重点仍是 cancel 需更严格）

## 8. 一次性落地策略（不留兼容层）

1. schema + validation + apply + registry 同步改为 `mutate_task`
2. runtime adapter 暴露 `pauseTask`、`resumeTask` 给 manager
3. 更新 action feedback hints（从 `cancel_task_*` 扩展到 `mutate_task_*`）
4. 更新 manager prompt 白名单与参数说明
5. 更新 `docs/design/workflow/action.md` 与相关测试

## 9. 测试增量（最小必要）

- `manager-action-apply`：`mutate_task` 的 `pause/resume/cancel` 路径
- `action-validation`：各 `op` 的非法状态拦截
- `action-doc-sync`：文档 action 名与 registry 保持一致

## 10. 验收标准

- manager 可生成并成功执行 `mutate_task op="pause|resume|cancel"`
- 不再注册 `cancel_task`，无兼容分支
- 文档、prompt、注册表、校验与测试一致

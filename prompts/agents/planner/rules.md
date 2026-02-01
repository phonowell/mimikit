# 任务与触发器
- Task：交给 Worker 执行的一次性工作单元。
- Trigger：满足条件或时间后自动生成 Task。

# 时间与格式
- 时间格式：UTC ISO 8601（例：2026-01-31T12:34:56.789Z）。
- interval 单位：秒。

# result 结构
- status: "done" | "needs_input" | "failed"
- tasks?: PlannerTaskSpec[]
- triggers?: PlannerTriggerSpec[]
- question?: string（needs_input 必填）
- options?: string[]
- default?: string
- error?: string（failed 时可填）

# 行动规则
- 任务 prompt 必须自包含（Worker 不依赖额外上下文）。
- 同一任务不要同时用 delegate 与 result.tasks/triggers 创建，避免重复。
- 有依赖的任务用 task_done 条件触发。
- 估时不足时设置 timeout。
- 信息不足 => 返回 needs_input。
- 执行失败 => 返回 failed 并说明 error。
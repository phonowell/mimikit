# Workflow 索引（Task / Action / Plan / Focus）

> 返回 [系统设计总览](../README.md)

## 概念文档

- [收敛落地清单](./convergence-checklist.md)
- [领域模型最小语义 RFC（2026-03-11）](./minimal-semantics-rfc-2026-03-11.md)
- [任务（Task）](./task.md)
- [动作（Action）](./action.md)
- [计划（Plan / TaskPlan）](./plan.md)
- [焦点（Focus）](./focus.md)
- [记忆机制（Memory）](./memory.md)
- [Worktree 槽位工作流](./worktree.md)

## 关系图

1. manager 解析回复尾部 action 区并做 schema 校验。
2. `enqueue_task` 直接创建 task；`create_plan` 创建定时、空闲或 worker 槽位可用触发计划。
3. task/plan/input/history 统一归属到一个 `focusId`。
4. worker 将 task 派发到外部执行运行时，结果经 `results` 回流给 manager。

## 单一事实源

- Task 生命周期与执行链路（唯一权威）：`./task.md`
- Action 协议、动作清单与执行语义（唯一权威）：`./action.md`
- Plan 生命周期与触发机制（唯一权威）：`./plan.md`
- Focus 生命周期与归属规则（唯一权威）：`./focus.md`
- Memory 后台维护策略（唯一权威）：`./memory.md`
- Worktree 槽位与落地流程：`./worktree.md`

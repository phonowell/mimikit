# Workflow 索引（Task / Action / Plan / Focus）

> 返回 [系统设计总览](../README.md)

## 概念文档

- [任务（Task）](./task.md)
- [动作（Action）](./action.md)
- [计划（Plan / TaskPlan）](./plan.md)
- [焦点（Focus）](./focus.md)

## 关系图

1. manager 解析回复尾部 action 区并做 schema 校验。
2. `run_task` 直接创建 task；`create_plan` 创建定时或空闲触发计划。
3. task/plan/input/history 统一归属到一个 `focusId`。
4. worker 执行 task，结果经 `results` 回流给 manager。

## 单一事实源

- Task 生命周期与执行链路：`./task.md`
- Action 协议与动作清单：`./action.md`
- Plan 生命周期与触发机制：`./plan.md`
- Focus 生命周期与归属规则：`./focus.md`

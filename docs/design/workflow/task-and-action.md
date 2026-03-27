# Workflow 索引（Task / Action / Plan / Focus）

> 返回 [系统设计总览](../README.md)

## 概念文档

- [任务（Task）](./task.md)
- [动作（Action）](./action.md)
- [计划（Plan / TaskPlan）](./plan.md)
- [焦点（Focus）](./focus.md)
- [记忆机制（Memory）](./memory.md)

## 关系图

1. manager 输出单个结构化 turn：`{ reply, actions }`
2. `enqueue_task` 直接创建 task
3. `set_plan` 创建或整体替换持续触发计划；计划触发后只派发 `enqueue_task`
4. task / plan / history 通过 `assign_focus` 归属到某个 `focusId`
5. worker 把执行结果压缩后回流给 manager

## 单一事实源

- Task：`./task.md`
- Action：`./action.md`
- Plan：`./plan.md`
- Focus：`./focus.md`
- Memory：`./memory.md`

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
5. worker 把执行结果压缩后回流给 manager；manager 在同目标低风险场景下默认继续推进、继续推动项目组合，只在真正的例外场景上提
6. action 授权只由结构契约、runtime 合法性与风险门禁共同决定；不再维护 continuation 锚点或 validation 预决策壳

## 层级定义

- Focus 是工作线归属与隔离单元，并非任务板；assign_focus 是唯一改变归属的入口。
- Plan 是 manager 当前推进路径的假说；它需要由 runtime 事实与 task 结果持续验证，不能成为最高真相。
- Task 是分散在不同 workline 的 subagent 执行合同；manager 需要尊重合同而非用它来阻塞推进。
- manager 的第一职责是持续推进项目组合，除非高风险、证据不足或目标冲突才上提用户，避免把职责退回给用户。

## 单一事实源

- Task：`./task.md`
- Action：`./action.md`
- Plan：`./plan.md`
- Focus：`./focus.md`
- Memory：`./memory.md`

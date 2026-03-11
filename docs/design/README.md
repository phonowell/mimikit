# 系统设计（v7）

> 当前架构：`manager(role) / worker(single, external-exec dispatch)`。

## 阅读路径

- 架构总览：`./architecture/system-architecture.md`
- 运行时执行：`./architecture/runners.md`
- Workflow 索引：`./workflow/task-and-action.md`
- 收敛落地清单：`./workflow/convergence-checklist.md`
- 领域模型收敛 RFC：`./workflow/minimal-semantics-rfc-2026-03-11.md`
- 任务概念：`./workflow/task.md`
- 动作协议：`./workflow/action.md`
- 计划机制：`./workflow/plan.md`
- 焦点机制：`./workflow/focus.md`
- 记忆机制：`./workflow/memory.md`
- 接口与状态：`./workflow/interfaces-and-state.md`
- WebUI 规范：`./ui/webui-design-language.md`

## 文档分工

- 架构边界、启动顺序、一致性目标：`architecture/system-architecture.md`
- provider/runner 细节与输出结构：`architecture/runners.md`
- Task 生命周期与执行链路：`workflow/task.md`
- 五对象最小语义收敛：`workflow/minimal-semantics-rfc-2026-03-11.md`
- 收敛落地进度与下一刀：`workflow/convergence-checklist.md`
- Action 协议与执行语义：`workflow/action.md`
- Plan 生命周期与触发机制：`workflow/plan.md`
- Focus 生命周期与归属规则：`workflow/focus.md`
- Memory 刷新策略：`workflow/memory.md`
- HTTP/CLI、配置与状态目录：`workflow/interfaces-and-state.md`

## 设计原则

1. 一次性全量切换，不保留运行期兼容层。
2. `manager` 负责对话与编排，`worker` 负责外部执行调度与结果回写。
3. 提示词只放 `prompts/`，业务代码不硬编码长提示词。
4. 队列语义固定：`inputs -> history`、`results -> tasks`。

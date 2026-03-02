# 系统设计（v7）

> 当前架构：`manager(role) / worker(single)`。

## 阅读路径

- 架构总览：`./architecture/system-architecture.md`
- 运行时执行：`./architecture/runners.md`
- Workflow 索引：`./workflow/task-and-action.md`
- 任务概念：`./workflow/task.md`
- 动作协议：`./workflow/action.md`
- 计划机制：`./workflow/plan.md`
- 焦点机制：`./workflow/focus.md`
- 接口与状态：`./workflow/interfaces-and-state.md`
- WebUI 规范：`./ui/webui-design-language.md`

## 单一事实源

- 架构边界、启动顺序、一致性目标：`architecture/system-architecture.md`
- provider/runner 细节与输出结构：`architecture/runners.md`
- Task 生命周期与执行链路：`workflow/task.md`
- Action 协议与动作清单：`workflow/action.md`
- Plan 生命周期与触发机制：`workflow/plan.md`
- Focus 生命周期与归属规则：`workflow/focus.md`
- HTTP/CLI、环境变量、配置结构、状态目录、重启语义：`workflow/interfaces-and-state.md`

## 设计原则

1. 一次性全量切换，不保留运行期兼容层。
2. `manager` 负责对话与编排，`worker` 负责执行。
3. 提示词只放 `prompts/`，业务代码不硬编码长提示词。
4. 队列语义固定：`inputs -> history`、`results -> tasks`。

# 系统设计（v7）

> 当前架构：`manager(role) / worker(profile)`。

## 阅读路径

- 架构总览：`./architecture/system-architecture.md`
- 运行时执行：`./architecture/runners.md`
- 任务协议：`./workflow/task-and-action.md`
- 接口与状态：`./workflow/interfaces-and-state.md`
- WebUI 规范：`./ui/webui-design-language.md`

## 单一事实源

- 架构边界、启动顺序、一致性目标：`architecture/system-architecture.md`
- provider/runner 细节与输出结构：`architecture/runners.md`
- 任务生命周期、Action 协议、核心数据结构：`workflow/task-and-action.md`
- HTTP/CLI、环境变量、配置结构、状态目录、重启语义：`workflow/interfaces-and-state.md`

## 设计原则

1. 一次性全量切换，不保留运行期兼容层。
2. `manager` 负责对话与编排，`worker` 负责执行。
3. 提示词只放 `prompts/`，业务代码不硬编码长提示词。
4. 队列语义固定：`inputs -> history`、`results -> tasks`。

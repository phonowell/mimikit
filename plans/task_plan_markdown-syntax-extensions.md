# task_plan_markdown-syntax-extensions

## 目标
- WebUI 安全渲染表格、图片与任务列表语法。

## 阶段与步骤
1. 扩展 Markdown 白名单与安全策略（src/webui/markdown.js）。
2. 补充表格/图片/任务列表样式（src/webui/components.css）。
3. 校验渲染输出不会破坏现有消息布局与安全约束。

## 决策
- 图片仅允许 http/https 资源，不开放 data:。
- 任务列表输入框强制 disabled，避免交互副作用。

## 风险
- 表格在窄屏需要横向滚动。

## 状态
- 当前阶段：已完成
- 进度：3/3

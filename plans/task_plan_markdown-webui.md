# task_plan_markdown-webui

## 目标
- WebUI 中 agent/assistant 消息可安全渲染 Markdown，避免 XSS。

## 阶段与步骤
1. 复查 WebUI 消息渲染逻辑与样式入口，确定改动点（src/webui/messages.js, components.css）。
2. 增加安全 Markdown 解析与渲染模块，并接入 assistant 消息渲染流程（src/webui/markdown.js, src/webui/messages.js）。
3. 补充 Markdown 相关样式，确保阅读体验与现有气泡一致（src/webui/components.css）。

## 决策
- 仅对 agent/assistant 消息启用 Markdown 渲染；用户消息保持纯文本。
- 渲染器仅生成白名单元素，并限制链接协议。
- 不引入外部 CDN 依赖，避免不可访问问题。

## 风险
- 简化版 Markdown 解析不覆盖所有语法边界。

## 状态
- 当前阶段：已完成
- 进度：3/3

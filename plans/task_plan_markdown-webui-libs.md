# task_plan_markdown-webui-libs

## 目标
- WebUI 通过第三方库安全渲染 Markdown（marked + DOMPurify），不依赖外部 CDN。

## 阶段与步骤
1. 引入并定位第三方库资源，确定前端加载与服务端静态映射方式。
2. 改造 Markdown 渲染模块，使用 marked 解析 + DOMPurify 清洗并接入消息渲染。
3. 调整服务端静态文件路由，安全暴露 vendor 资源并验证样式兼容。

## 决策
- 仅对 agent/assistant 消息启用 Markdown 渲染；用户消息保持纯文本。
- 允许的资源通过服务端白名单映射，不开放 node_modules 目录。

## 风险
- 第三方库升级可能导致 ESM 入口路径变化。

## 状态
- 当前阶段：已完成
- 进度：3/3

# task_plan_loading-placeholder

## 目标
- WebUI 在新任务启动时在消息列表底部显示占位对话（loading 动画），增强反馈。

## 阶段与步骤
1. 读取 WebUI 消息渲染与状态轮询逻辑，确定插入点（src/webui/messages.js, components.css）。
2. 增加“任务开始/结束”状态检测与占位消息插入/移除逻辑（src/webui/messages.js）。
3. 增加占位消息与 loading 动画样式（src/webui/components.css）。

## 决策
- 触发条件：agentStatus === 'running'。
- 移除条件：收到新的 assistant（agent）消息。
- 展示形态：assistant 气泡占位，仅动画（typing dots）。

## 风险
- 状态轮询节奏导致反馈延迟（2s 轮询）。

## 状态
- 当前阶段：已完成
- 进度：3/3

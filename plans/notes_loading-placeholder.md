# notes_loading-placeholder

- 需求：开始新任务时，在消息列表底部弹出占位对话（loading 动画）。
- 已确认：触发条件 agentStatus === 'running'；收到新的 assistant（agent）消息即移除；assistant 气泡占位，仅动画。
- 复盘修正：基于最新 message id 触发渲染，避免消息上限导致 length 不变时占位不移除。

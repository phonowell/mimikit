# task_plan_restart-idle

## 目标
- 调整 WebUI 重启服务按钮：当“完全 idle”时不弹二次确认。

## 阶段与步骤
1. 解析当前 WebUI 重启逻辑与状态来源（src/webui/restart.js, src/webui/messages.js:4-156）。
2. 在消息控制器内维护最新状态并提供读取接口；断线时清空状态（src/webui/messages.js:10-156）。
3. 重启按钮点击时按最新状态决定是否跳过 confirm（src/webui/restart.js:4-33）。

## 决策
- “完全 idle”判定：agentStatus === 'idle' 且 activeTasks === 0 且 pendingTasks === 0。
- 若无最新状态（未轮询/断线），保持二次确认。

## 风险
- 状态延迟：依赖上次轮询结果（可接受；断线时不跳过确认）。

## 状态
- 当前阶段：已完成
- 进度：3/3

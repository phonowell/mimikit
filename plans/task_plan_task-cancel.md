# 任务计划: task-cancel

## 目标
- 支持任务取消：WebUI 按钮与 manager 内部命令
- 取消覆盖 pending/running，并保证状态一致与可追踪

## 阶段
1. 明确取消语义与数据流（已确认）
   - running 任务中断 LLM 调用（Abort）
   - canceled 结果写入队列与归档
2. 实现取消能力与入口（已完成）
   - src/supervisor/runtime.ts
   - src/supervisor/worker.ts
   - src/llm/sdk-runner.ts
   - src/roles/runner.ts
   - src/supervisor/cancel.ts
   - src/supervisor/manager.ts
   - src/supervisor/supervisor.ts
   - src/http/index.ts
   - src/webui/tasks.js
   - src/webui/components.css
   - prompts/agents/manager/system.md
3. 手动验证（待确认）
   - lint / type-check / test 已完成
   - WebUI 取消 pending/running
   - manager 输出 cancel_task

## 决策
- running 任务取消策略：Abort + result
- canceled 结果：写入队列与归档

## 风险
- 取消与完成竞态导致状态回写
- AbortError 与超时识别冲突

## 状态
- 进度: 2/3
- 阻塞: 无

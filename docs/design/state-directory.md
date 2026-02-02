# 状态目录（.mimikit/）

> 返回 [系统设计总览](./README.md)

## 目录结构（概要）
- user-inputs.jsonl：Teller 整理后的输入摘要（可在 Thinker 消费前更新，`processedByThinker` 标记）
- teller-notices.jsonl：Thinker → Teller 的事实/重要数据（`processedByTeller` 标记）
- thinker-state.json：Thinker sessionId / notes / lastWakeAt
- history.jsonl：聊天历史（WebUI 展示）
- agent-queue/：任务队列（单文件任务，含 status）
- agent-results/：任务结果（Thinker 读取后删除）
- llm/：模型输出调试文件
- log.jsonl：运行日志

## 约束
- JSONL 以“追加 + 重写标记”为主；标记 processed 时整文件重写。
- 关键文件写入使用 `.lock` 串行化（store-lock）。
- 任务与结果结构见 docs/design/task-data.md。

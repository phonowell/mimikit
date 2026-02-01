# 状态目录（.mimikit/）

> 返回 [系统设计总览](./README.md)

## 目录结构（概要）
- inbox.json：用户输入队列（Host 写入）
- teller_inbox.json：任务结果/needs_input 事件
- pending_question.json：ask_user 等待回覆
- history.json：对话历史（归档标记见 memory.md）
- task_status.json：任务终态索引（条件评估用）
- memory.md：长期记忆
- memory/ 与 memory/summary/：近期记忆与汇总
- planner/queue | running | results：Planner 任务与结果
- worker/queue | running | results：Worker 任务与结果
- triggers/：持久化调度与条件触发器
- log.jsonl：运行日志

## 约束
- 跨进程通信统一落在 .mimikit/ JSON，需原子写入。
- 任务与触发器结构见 docs/design/task-data.md。
- 记忆归档与 history 规则见 docs/design/memory.md。

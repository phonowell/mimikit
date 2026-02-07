# 状态目录（.mimikit/）

> 返回 [系统设计总览](./README.md)

## 目录结构（概要）
- history.jsonl：聊天历史（WebUI 展示）
- log.jsonl：运行日志
- evolve/feedback.jsonl：自演进反馈事件（来自 API 反馈、manager 内部采集、空闲回顾、运行时信号）
- evolve/feedback-archive.md：反馈归档（可读审计轨迹）
- evolve/issue-queue.json：按 fingerprint 去重后的问题队列（含 ROI/置信度/状态）
- llm/YYYY-MM-DD/HHMMSS-xxxx.txt：LLM 交互归档（完整输入/输出，按日期目录分文件）
- tasks/YYYY-MM-DD/{taskId}_{shortTitle}.md：任务结果归档（prompt/result/时间/耗时/usage 等）

## 说明
- 任务仍在内存，进程重启会丢失。
- 任务结果会写入 tasks 目录。
- 任务结构见 docs/design/task-data.md。

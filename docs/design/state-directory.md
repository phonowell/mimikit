# 状态目录（.mimikit/）

> 返回 [系统设计总览](./README.md)

## 目录结构（概要）
- history.jsonl：聊天历史（WebUI 展示）
- log.jsonl：运行日志
- llm/YYYY-MM-DD/HHMMSS-xxxx.txt：LLM 交互归档（完整输入/输出，按日期目录分文件）

## 说明
- 任务与结果不落盘，进程重启会丢失。
- 任务结构见 docs/design/task-data.md。

# 状态目录（.mimikit/）

> 返回 [系统设计总览](./README.md)

## 目录结构（概要）
- history.jsonl：聊天历史（WebUI 展示）
- log.jsonl：运行日志

## 说明
- 任务与结果不落盘，进程重启会丢失。
- 任务结构见 docs/design/task-data.md。

# 系统设计 (v4)

> 当前为双角色架构（Manager + Worker）。

## 阅读路径
- docs/design/overview.md：设计目标、组件、核心流程
- docs/design/state-directory.md：.mimikit/ 状态目录与文件
- docs/design/supervisor.md：双循环职责与调度策略
- docs/design/task-system.md：任务生命周期
- docs/design/task-data.md：任务/结果结构
- docs/design/commands.md：MIMIKIT 命令协议
- docs/design/interfaces.md：HTTP 接口与 CLI

## 设计原则
1. Manager 直接面向用户，负责理解 + 回复 + 派发任务
2. Worker 专注执行任务，不与用户对话
3. 任务队列在内存中维护，崩溃后可丢失
4. 状态仅落盘历史与日志（.mimikit/）

## 角色职责（摘要）
- Manager：聊天 + 任务调度 + 结果汇总
- Worker：执行任务并回传结果

## 关联文档
- docs/codex-sdk.md
- prompts/agents/manager/system.md
- prompts/agents/worker/system.md

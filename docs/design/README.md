# 系统设计（v4）

> 当前为双角色架构（Manager + Worker）。

## 阅读路径
- `docs/design/overview.md`
- `docs/design/state-directory.md`
- `docs/design/supervisor.md`
- `docs/design/task-system.md`
- `docs/design/task-data.md`
- `docs/design/commands.md`
- `docs/design/interfaces.md`

## 设计原则
1. Manager 面向用户，负责理解、回复与任务派发。
2. Worker 专注执行任务并回传结果。
3. 任务队列以内存调度为主，运行态可持久化并恢复。
4. 状态落盘：历史、日志、运行快照、任务结果。

## 关联文档
- `docs/codex-sdk.md`
- `prompts/agents/manager/system.md`
- `prompts/agents/worker/system.md`

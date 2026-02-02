# 系统设计 (v3)

> 当前为三角色架构（Teller + Thinker + Worker）。

## 阅读路径
- docs/design/overview.md：设计目标、组件、核心流程
- docs/design/state-directory.md：.mimikit/ 状态目录与文件协议
- docs/design/supervisor.md：三循环职责与调度策略
- docs/design/task-system.md：任务生命周期
- docs/design/task-data.md：任务/结果结构
- docs/design/commands.md：MIMIKIT 命令协议
- docs/design/interfaces.md：HTTP 接口与 CLI

## 设计原则
1. Teller 只做快速回复与输入摘要整理
2. Thinker 做决策与调度，单线程、可恢复 session
3. Worker 专注执行任务，不与用户对话
4. 状态统一落盘到 .mimikit/（JSONL + JSON）

## 角色职责（摘要）
- Teller：聊天 + 整理摘要 + 传达通知
- Thinker：解析输入、派发/更新/取消任务、通知用户
- Worker：执行任务并写入结果

## 关联文档
- docs/codex-sdk.md
- prompts/agents/teller/system.md
- prompts/agents/thinker/system.md
- prompts/agents/worker/system.md

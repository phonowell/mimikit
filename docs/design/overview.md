# 系统概览 (v3)

> 返回 [系统设计总览](./README.md)

## 设计目标
- Teller 本地小模型快速响应
- Thinker 负责理解与调度（同一 session 可恢复）
- Worker 并发执行任务
- 状态与通信统一落在 .mimikit/

## 组件
- Supervisor：启动三循环并管理运行状态
- Teller：面向用户的轻量交互
- Thinker：任务编排与决策
- Worker：任务执行
- WebUI/HTTP：输入与状态展示

## 核心流程（高层）
1. 用户输入 → Teller 回复，并在有新要点时输出 `<MIMIKIT:record_input>...</MIMIKIT:record_input>`。
2. Teller 写入 `user-inputs.jsonl`（整理摘要，可在 Thinker 消费前更新），通知写入 `teller-notices.jsonl`。
3. Thinker 在输入稳定后苏醒，解析输入/结果，派发任务或通知。
4. Worker 从 `agent-queue/` 取任务并写入结果到 `agent-results/`。
5. Thinker 读取结果并通知 Teller。

## 状态目录
详见 docs/design/state-directory.md。

## 深入阅读
- 三循环细节：docs/design/supervisor.md
- 任务生命周期与结构：docs/design/task-system.md / docs/design/task-data.md
- MIMIKIT 命令协议：docs/design/commands.md
- HTTP/CLI：docs/design/interfaces.md

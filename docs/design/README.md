# 系统设计 (v2)

> 本文档描述当前已落地的 v2 runtime。高层与细节分离，具体语义见子文档。

## 子文档导航
- docs/design/supervisor.md：主循环、并发、恢复、超时
- docs/design/task-system.md：任务生命周期、触发器、Planner/Worker 结果
- docs/design/memory.md：记忆存储/归档/检索
- docs/design/tools.md：工具定义与权限矩阵

## 设计原则
1. LLM 只做必须的智能工作
2. Teller/Planner 仅工具交互，不直接读写文件
3. Supervisor 负责确定性调度与状态维护
4. 跨进程通信统一落在 .mimikit/ JSON，原子写入

## 上下文策略
- 每次 run 都创建新 thread，不复用线程上下文
- Teller/Planner 只使用 Supervisor 注入的 history/memory + 当前输入

## 角色职责
- Supervisor：调度/恢复/日志/状态索引
- Teller：面向用户的轻量交互与转交 Planner
- Planner：需求拆解，生成任务与触发器
- Worker：执行任务（sandbox + shell）

## 内置执行 vs LLM
- 内置：触发器评估、任务队列、history 裁剪、归档调度、task_status 索引
- LLM：回复、拆解、执行任务、语义条件 llm_eval、归档摘要生成

## 文件协议
- 状态目录与字段权威定义见 docs/design/task-system.md 与 docs/design/memory.md
- 任务终态索引用 task_status.json（任务结果可清理）

## WebUI/HTTP
- 接口见 src/http-handler.ts；WebUI 静态文件在 src/webui/

## 关联文档
- docs/minimal-architecture.md
- docs/codex-sdk.md
- docs/agents/teller.md
- docs/agents/planner.md
- docs/agents/worker.md

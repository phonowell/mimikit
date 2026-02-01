# 系统设计 (v2)

> 当前已落地的 v2 runtime，按“概览 → 机制 → 细节”阅读。

## 阅读路径
- docs/design/overview.md：设计目标、组件、核心流程、边界
- docs/design/state-directory.md：.mimikit/ 状态目录与文件协议
- docs/design/supervisor.md：主循环、并发、恢复、超时
- docs/design/task-system.md：任务生命周期总览
- docs/design/task-data.md：任务/触发器/结果 JSON 结构
- docs/design/task-conditions.md：条件类型、评估与时间语义
- docs/design/memory.md：归档/检索/注入
- docs/design/tools.md：工具定义与权限矩阵
- docs/design/interfaces.md：HTTP 接口与 CLI 命令

## 设计原则
1. LLM 只做必须的智能工作
2. Teller/Planner 仅工具交互，不直接读写文件
3. Supervisor 负责确定性调度与状态维护
4. 跨进程通信统一落在 .mimikit/ JSON，原子写入

## 上下文策略
- 每次 run 都创建新 thread，不复用线程上下文
- Teller/Planner 只使用 Supervisor 注入的 history/memory + 当前输入

## 角色职责（摘要）
- Supervisor：调度/恢复/日志/状态索引
- Teller：面向用户的轻量交互与转交 Planner
- Planner：需求拆解与任务/触发器生成
- Worker：执行任务（Codex SDK + shell）

## 关联文档
- docs/codex-sdk.md
- prompts/agents/teller/identity.md
- prompts/agents/teller/tools.md
- prompts/agents/teller/output.md
- prompts/agents/planner/identity.md
- prompts/agents/planner/tools.md
- prompts/agents/planner/rules.md
- prompts/agents/planner/output.md
- prompts/agents/worker/identity.md
- prompts/agents/worker/tools.md
- prompts/agents/worker/rules.md
- prompts/agents/worker/output.md

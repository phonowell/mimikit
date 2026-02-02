# 系统概览 (v2)

> 返回 [系统设计总览](./README.md)

## 设计目标
- 24x7 稳定运行，Supervisor 纯代码调度
- Teller/Planner 仅工具交互，Worker 执行具体任务
- 状态与通信统一落在 .mimikit/
- 运行日志与运行历史单独落盘（runs/），便于审计与排障
- 关键规则（Teller/Planner/Worker）：见 [系统设计总览](./README.md) 的“关键规则”一节

## 组件
- Supervisor：主循环，调度/恢复/记录
- Teller：面向用户的 LLM（reply/ask_user/list/cancel 等工具），不执行任务，所有请求转交 Planner
- Planner：目标澄清与任务/触发器生成
- Worker：执行子任务（Codex SDK + shell）
- Memory：归档/检索，供 Teller/Planner/Worker 使用
- WebUI/HTTP：状态与输入接口

## 核心流程（高层）
1. Supervisor tick：维护历史、处理触发器、派发 Planner/Worker、收集结果、唤醒 Teller。
2. Teller 被输入/结果唤醒，读取 history + memory + inbox + teller_inbox，将用户请求全部委派给 Planner 并输出工具调用。
3. Planner 消费 planner/queue，生成 tasks/triggers 或 needs_input。
4. Worker 消费 worker/queue，执行任务并写入结果。

## 代码布局（摘要）
- src/cli.ts
- src/http/（index.ts, handler.ts, static.ts, utils.ts）
- src/supervisor/、src/roles/、src/tasks/、src/tools/、src/scheduler/
- src/memory/、src/storage/、src/fs/、src/log/、src/webui/
- 详细路径见 docs/dev-conventions.md

## 内置执行 vs LLM
- 内置：触发器评估、任务队列、history 裁剪、归档调度、task_status 索引
- LLM：回复、规划、执行任务、语义条件 llm_eval、归档摘要生成

## 深入阅读
- 状态目录与文件协议：docs/design/state-directory.md
- 主循环细节：docs/design/supervisor.md
- 任务生命周期与结构：docs/design/task-system.md / docs/design/task-data.md
- 条件语义：docs/design/task-conditions.md
- 记忆系统：docs/design/memory.md
- 工具与权限：docs/design/tools.md
- HTTP/CLI：docs/design/interfaces.md

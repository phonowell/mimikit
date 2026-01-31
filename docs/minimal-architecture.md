# Mimikit Minimal Architecture (v2)

## 关联文档
- docs/design/README.md
- docs/codex-sdk.md

## 设计目标
- 24x7 稳定运行，Supervisor 纯代码调度
- Teller/Planner 仅工具交互，Worker 执行具体任务
- 状态与通信统一落在 .mimikit/

## 组件
- Supervisor：主循环，调度/恢复/记录
- Teller：面向用户的 LLM（reply/ask_user/list/cancel 等工具）
- Planner：需求拆解与任务/触发器生成
- Worker：执行子任务（Codex SDK + shell）
- Memory：归档/检索，供 Teller/Planner/Worker 使用
- WebUI/HTTP：状态与输入接口

## 代码布局
src/
  cli.ts
  http/ (index.ts, handler.ts, static.ts, utils.ts)
  supervisor/
  roles/
  tasks/
  tools/
  scheduler/
  memory/
  storage/
  fs/
  log/
  webui/

## 状态目录 (.mimikit/)
- inbox.json：用户输入队列
- teller_inbox.json：任务结果/needs_input 事件
- pending_question.json：ask_user 等待回覆
- history.json：对话历史
- task_status.json：任务终态索引
- memory.md：长期记忆
- memory/ 与 memory/summary/
- planner/queue | running | results
- worker/queue | running | results
- triggers/
- log.jsonl

## 核心流程
- Supervisor 每 1s tick：维护历史、处理触发器、派发 Planner/Worker、收集结果、唤醒 Teller
- Teller 被输入/结果唤醒，读取 history + memory + inbox + teller_inbox，输出工具调用
- Planner 消费 planner/queue，生成 tasks/triggers 或 needs_input
- Worker 消费 worker/queue，执行任务并写入结果

## Memory 规则
- 触发条件：未归档消息 >100 或距上次归档 >6h
- 归档：
  - <=5 天：写入 memory/YYYY-MM-DD-slug.md
  - 当月/上月：生成 daily summary (memory/summary/YYYY-MM-DD.md)
  - 更早：生成 monthly summary (memory/summary/YYYY-MM.md)
- 检索：BM25 + keyword fallback，基于 .mimikit/memory* 文件

## HTTP API
- GET / -> WebUI
- GET /api/status
- POST /api/input
- GET /api/messages?limit=...
- GET /api/tasks?limit=...
- POST /api/restart

## 核心命令
- tsx src/cli.ts
- tsx src/cli.ts --port 8787
- tsx src/cli.ts memory status|index|search

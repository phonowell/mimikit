# notes_goal-gap-20260128

## 目标覆盖检查
- HTTP: /, /health, /tasks, /tasks/:id -> src/server/http.ts
- Master/队列/账本 -> src/runtime/master.ts, src/runtime/queue.ts, src/runtime/ledger/*
- Worker/resume/sessionId -> src/runtime/worker.ts
- Session store/transcript/lock -> src/session/*
- Memory 搜索/Prompt 注入 -> src/memory/*, src/agent/prompt.ts
- CLI: serve/task/compact-tasks -> src/cli.ts

## 差距
- 与 docs/minimal-implementation-plan.md 对齐，无新增缺口

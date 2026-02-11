# 系统设计（v6）

> 当前架构：`manager / evolver / worker`。

## 阅读路径
- `docs/design/system-architecture.md`
- `docs/design/runners.md`
- `docs/design/task-and-action.md`
- `docs/design/interfaces-and-state.md`

## 设计原则
1. 一次性全量重构（Big Bang），不保留旧多角色链路与旧队列字段兼容层。
2. `manager` 是唯一对话与编排入口，直接消费 `inputs/results`。
3. `worker` 分层：`standard`（低成本）与 `specialist`（高能力）。
4. 队列语义固定：`inputs -> history`、`results -> tasks`。
5. `evolver` 仅在空闲窗口触发，不阻塞在线请求。
6. 提示词仅放在 `prompts/`，业务代码不硬编码长提示词。

## 关联目录
- `src/orchestrator/*`
- `src/manager/*`
- `src/evolver/*`
- `src/worker/*`
- `src/streams/*`
- `src/reporting/*`

## 提示词目录（当前实现）
- `prompts/manager/system.md`
- `prompts/manager/injection.md`
- `prompts/manager/fallback-reply.md`
- `prompts/manager/system-fallback-reply.md`
- `prompts/worker-standard/system.md`
- `prompts/worker-standard/injection.md`
- `prompts/worker-specialist/system.md`
- `prompts/worker-specialist/injection.md`
- `prompts/evolver/system.md`
- `prompts/evolver/injection.md`

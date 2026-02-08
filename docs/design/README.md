# 系统设计（v5）

> 当前为三层架构：`teller` / `thinker` / `worker`。

## 阅读路径
- `docs/design/overview.md`
- `docs/design/orchestrator.md`
- `docs/design/task-system.md`
- `docs/design/task-data.md`
- `docs/design/commands.md`
- `docs/design/interfaces.md`
- `docs/design/state-directory.md`
- `docs/design/feedback-improvement-loop.md`

## 设计原则
1. `teller` 负责对话理解与最终回复语气控制。
2. `thinker` 负责决策与任务编排，不直接对用户输出。
3. `worker` 按能力/成本分层：`standard` 与 `expert`。
4. teller/thinker 通过 `jsonp` 通道解耦，按 cursor 增量消费。
5. 运行状态最小持久化：历史、日志、任务快照、通道 cursor、standard worker progress/checkpoint。

## 关联文件
- `src/orchestrator/*`
- `src/teller/*`
- `src/thinker/*`
- `src/worker/*`
- `src/streams/*`

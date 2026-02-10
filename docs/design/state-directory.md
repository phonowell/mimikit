# 状态目录（当前实现）

> 返回 [系统设计总览](./README.md)

默认目录：`./.mimikit/`

## 目录结构
- `history.jsonl`：对话历史
- `log.jsonl`：运行日志
- `runtime-state.json`：任务快照 + reporting + queue cursor
- `inputs/`
  - `packets.jsonl`：待消费用户输入
  - `state.json`：`managerCursor`
- `results/`
  - `packets.jsonl`：待消费任务结果
  - `state.json`：`managerCursor`
- `tasks/`
  - `tasks.jsonl`：任务快照流
- `feedback.md`
- `user_profile.md`
- `agent_persona.md`
- `agent_persona_versions/*.md`
- `task-progress/{taskId}.jsonl`
- `task-checkpoints/{taskId}.json`
- `tasks/YYYY-MM-DD/*.md`（任务结果归档）
- `llm/YYYY-MM-DD/*.txt`（LLM 调用归档）
- `reporting/events.jsonl`
- `reports/daily/YYYY-MM-DD.md`

## runtime-state 结构约束
- schema：`src/storage/runtime-state-schema.ts`
- `queues` 仅包含：
  - `inputsCursor`
  - `resultsCursor`
- 旧 `channels.*` 字段不再兼容。

## queue state 结构约束
- schema 语义：`managerCursor` 必须是非负整数。
- 落盘文件：`inputs/state.json`、`results/state.json`。

# 系统概览（v6）

> 返回 [系统设计总览](./README.md)

## 目标
- 用最小链路完成“输入 → 编排 → 执行 → 回复”。
- 把在线执行与离线演进分离，避免相互阻塞。
- 在能力与费用之间可控切换（`standard` / `specialist`）。

## 角色
- `manager`
  - 输入：`inputs` 待消费用户输入 + `results` 待消费任务结果。
  - 读取：`history`、`tasks`（近窗切片）。
  - 输出：用户回复 + 任务动作（`@create_task/@cancel_task/@summarize_task_result`）。
- `worker`
  - 消费 manager 派发任务。
  - 执行后把 `TaskResult` 写入 `results`。
- `evolver`
  - 仅在空闲时读取 `history/tasks`。
  - 更新 `feedback.md`、`user_profile.md`、`agent_persona.md` 与 persona 版本快照。

## 主数据流
1. 用户输入进入 `inputs/packets.jsonl`。
2. `manager` 增量消费 `inputs/results`，写入 `history` 并执行任务编排。
3. `worker` 执行任务后写入 `results/packets.jsonl`。
4. `manager` 消费新结果，更新 `tasks` 快照并回复用户。
5. 系统空闲后，`evolver` 追加演进文档与版本记录。

## 关键策略
- `manager.minIntervalMs` 节流主循环，优先控制成本。
- 任务复用优先，避免重复派单。
- queue cursor 独立持久化到 `inputs/state.json`、`results/state.json`。
- 运行异常优先落日志与状态，不做静默吞错。

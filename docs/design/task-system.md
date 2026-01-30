# 任务系统

> 返回 [系统设计总览](./README.md)

## Teller

### 启动注入

1. 固定声明：`"You are the Mimikit runtime teller."`
2. `docs/agents/teller.md`
3. 动态上下文：对话历史、记忆检索结果、用户输入、任务结果

### 唤醒流程

1. 读取待处理输入/结果。
2. 结合对话历史与记忆，生成回复并调用 `reply`。
3. 若需任务，调用 `delegate` 委派 Planner（Teller 不拆分）。
4. 立即休眠。

## 生命周期

```
用户输入
  ↓
inbox.json + history.json（Host 写入）
  ↓
Supervisor 唤醒 Teller
  ↓
Teller 回复用户 + 委派 Planner → 立即休眠
  ↓
planner/queue/ → Planner → planner/results/
  ↓
Supervisor 解析 Planner 结果
  ├─ done → oneshot 子任务写入 worker/queue/
  ├─ needs_input → Teller ask_user → pending_question.json → 用户回复 → Teller → Planner
  └─ failed → 重试/汇报
  ↓
Worker 执行 → worker/results/
  ↓
Supervisor 更新 task_status.json → 唤醒 Teller 汇报

--- 调度/条件触发 ---
triggers/（schedule/conditional）→ Supervisor 评估 → 触发 oneshot 入队
```

## 任务实体

### 执行任务（Run）

`worker/queue|running|results` 中的实际执行单元，类型固定为 `oneshot`。

```jsonc
{
  "id": "task-001",
  "type": "oneshot",
  "prompt": "...",
  "priority": 5,
  "createdAt": "...",
  "attempts": 0,
  "timeout": null,
  "sourceTriggerId": "trigger-001",
  "triggeredAt": "..."
}
```

### 触发器（Trigger）

`triggers/` 中的持久化定义：`recurring` / `scheduled` / `conditional`。

```jsonc
{
  "id": "trigger-001",
  "type": "recurring|scheduled|conditional",
  "prompt": "...",
  "priority": 5,
  "createdAt": "...",
  "timeout": null,
  "schedule": { "interval": 21600, "lastRunAt": null, "nextRunAt": null },
  "condition": { "type": "file_changed", "params": { "path": "src/**/*.ts" } },
  "cooldown": 3600,
  "state": {
    "lastTriggeredAt": null,
    "lastEvalAt": null,
    "lastSeenResultId": null,
    "lastMtime": null,
    "initialized": false
  }
}
```

- `state` 按条件类型使用，未使用字段可省略。
- `schedule` 字段：`recurring` 用 `interval/lastRunAt/nextRunAt`，`scheduled` 用 `runAt`。
- `id` 必须全局唯一（建议 ULID/UUID），结果索引以 `id` 为键。

## 任务结果与索引

Worker 写入 `worker/results/{taskId}.json`，Supervisor 同步更新 `task_status.json`：

```jsonc
{
  "id": "task-001",
  "status": "done|failed|needs_input",
  "resultType": "text|code_change|analysis|summary",
  "result": { ... },
  "error": "...",
  "question": "...",
  "attempts": 1,
  "completedAt": "..."
}
```

`task_status.json` 记录任务最终状态（`status/ completedAt/ resultId/ sourceTriggerId`），用于条件评估与历史展示，结果文件可按保留策略清理。

**`needs_input`**：Planner 拆分过程中需要用户确认时返回 `needs_input`，Teller 通过 `ask_user` 发问，用户回复后重新委派 Planner。

## 条件类型（Condition）

`Condition` 用于 `delegate`/`schedule` 的 `conditional` 任务：

```jsonc
{ "type": "file_changed",  "params": { "path": "string", "fireOnInit": false } }
{ "type": "task_done",     "params": { "taskId": "string" } }
{ "type": "task_failed",   "params": { "taskId": "string" } }
{ "type": "file_exists",   "params": { "path": "string" } }
{ "type": "llm_eval",      "params": { "prompt": "string" } }
```

组合条件（`and` / `or`）支持嵌套。

**评估规则**：

- `AND` / `OR` 短路求值。
- `file_changed`：比较当前 mtime 与 `state.lastMtime`；首次仅初始化基线（除非 `fireOnInit=true`）。
- `task_done` / `task_failed`：读取 `task_status.json`，若状态匹配且 `state.lastSeenResultId` 不同，则触发并更新 `lastSeenResultId`。
- `llm_eval`：按批量 Worker 评估，结果由 Supervisor 消费，不唤醒 Teller。
- 冷却期：命中后写入 `lastTriggeredAt`，`cooldown` 期间不再触发。

## 任务串联

Planner 拆分复杂请求时，用 `task_done` 串联 oneshot 子任务（A 完成 → 触发 B）。

## Planner

**职责**：分析需求、判断复杂度、拆分任务、编排依赖、设置优先级/超时；必要时用 `get_recent_history` / `get_history_by_time` / `search_memory` 补充上下文。

**输出**：调用 `delegate` 派发 Worker/Trigger，不生成面向用户的文本。

## Worker

**执行环境**：完整 shell access（codex exec sandbox）。

**输出**：写入 `worker/results/{taskId}.json`，由 Supervisor 路由至 Teller。

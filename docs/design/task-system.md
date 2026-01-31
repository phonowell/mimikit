# 任务系统

> 返回 [系统设计总览](./README.md)

## Teller

### 启动注入

1. 固定声明：`"You are the Mimikit runtime teller."`
2. `docs/agents/teller.md`
3. 动态上下文：对话历史、记忆检索结果、用户输入、任务结果（均由 Supervisor 注入）


### 唤醒流程

1. 读取 Supervisor 注入的待处理输入/结果。
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
Supervisor 更新 task_status.json → 用户可见则唤醒 Teller 汇报

--- 调度/条件触发 ---
triggers/（schedule/conditional）→ Supervisor 评估 → 触发 oneshot 入队
```

## 任务实体

### 执行任务（Run）

`worker/queue|running|results` 中的实际执行单元，类型固定为 `oneshot`。语义评估任务由 `llm_eval` 条件触发，必须携带 `sourceTriggerId` 以便 Supervisor 识别为内部结果。

`attempts` 语义：入队时为 `0`，开始执行时递增为 `1`，重试时在重新入队前递增。

```jsonc
{
  "id": "task-001",
  "type": "oneshot",
  "traceId": "trace-001",
  "parentTaskId": "planner-001",
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
  "traceId": "trace-001",
  "parentTaskId": "task-001",
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
- `traceId` 用于链路追踪，缺省由系统生成并在子任务中继承；`parentTaskId` 指向上游任务。

## 任务结果与索引

### Worker 结果

Worker 写入 `worker/results/{taskId}.json`（仅终态）：

```jsonc
{
  "id": "task-001",
  "status": "done|failed",
  "resultType": "text|code_change|analysis|summary",
  "result": { ... },
  "error": "...",
  "failureReason": "timeout|error|killed",
  "attempts": 1,
  "traceId": "trace-001",
  "sourceTriggerId": "trigger-001",
  "startedAt": "...",
  "completedAt": "...",
  "durationMs": 12345
}
```

### Planner 结果

Planner 写入 `planner/results/{taskId}.json`：

- `status=done` → `tasks` 列出子任务/触发器定义（由 Supervisor 入队）
- `status=needs_input` → `question/options/default` 交给 Teller 发问
- `status=failed` → 进入重试/汇报流程

**`needs_input`**：仅存在于 `planner/results/`，不写入 `task_status.json`。

### task_status.json（终态索引）

Supervisor 基于 Worker 结果更新 `task_status.json`（仅终态，用于条件评估与历史展示，结果文件可按保留策略清理）：

```jsonc
{
  "id": "task-001",
  "status": "done|failed",
  "completedAt": "...",
  "resultId": "task-001",
  "sourceTriggerId": "trigger-001",
  "failureReason": "timeout|error|killed",
  "traceId": "trace-001"
}
```

`resultId` 与 `worker/results/{taskId}.json` 的文件名保持一致（即 taskId）。

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

Planner 拆分复杂请求时，用 `task_done` 串联 oneshot 子任务（A 完成 → 触发 B）。子任务继承同一 `traceId`，并用 `parentTaskId` 指向上游任务。

## 时间语义

- 所有时间戳使用 **UTC ISO 8601**（如 `2026-01-31T12:34:56.789Z`）。
- 触发器调度以 `schedule.nextRunAt` 为准；若缺失，按 `lastRunAt + interval` 或 `createdAt + interval` 推导。
- `recurring` 触发器：当 `now >= nextRunAt` 时触发一次，随后设置 `lastRunAt=now`、`nextRunAt=now+interval`（不补跑累计次数）。
- `scheduled` 触发器：若 `now >= runAt`，在下一轮立即触发并移除。
- 冷却期基于 `lastTriggeredAt`（UTC）判断。

## Planner

**职责**：分析需求、判断复杂度、拆分任务、编排依赖、设置优先级/超时；必要时用 `get_recent_history` / `get_history_by_time` / `search_memory` 补充上下文。

**输出**：调用 `delegate` 派发 Worker/Trigger，不生成面向用户的文本。

## Worker

**执行环境**：完整 shell access（codex exec sandbox）。

**输出**：写入 `worker/results/{taskId}.json`，由 Supervisor 处理；用户可见结果才唤醒 Teller。

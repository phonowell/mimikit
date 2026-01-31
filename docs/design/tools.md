# 工具系统

> 返回 [系统设计总览](./README.md)

## 工具定义

### `delegate`

委派子任务。

- **Teller 调用** → 写入 `planner/queue/`（派发 Planner）。
- **Planner 调用** → `type=oneshot` 写入 `worker/queue/`；`type=conditional` 写入 `triggers/`。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | `string` | 是 | 任务描述 |
| `type` | `"oneshot" \| "conditional"` | 否 | 默认 `"oneshot"`，仅 Planner 可指定 |
| `condition` | `Condition` | 否 | `type="conditional"` 时必填 |
| `priority` | `number` | 否 | 0-10，默认 `5` |
| `timeout` | `number \| null` | 否 | 超时秒数，`null` 使用角色默认值 |
| `traceId` | `string` | 否 | 观测链路 ID；缺省由系统生成，子任务继承 |

**返回**：`{ taskId: string }`（`oneshot`）或 `{ triggerId: string }`（`conditional`）

### `reply`

回复用户。

**参数**：`{ text: string }` → **返回**：`void`

### `remember`

写入记忆。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `string` | 是 | 记忆内容 |
| `longTerm` | `boolean` | 否 | `true` 追加到 `memory.md`；`false`（默认）写入 `memory/YYYY-MM-DD-{slug}.md` |

**返回**：`{ path: string }`

### `get_recent_history`

按位置获取历史会话（从最近往前）。

**参数**：`{ count: number, offset?: number }` → **返回**：`{ messages: Message[] }`

### `get_history_by_time`

按时间范围获取历史会话。

**参数**：`{ after: string, before?: string }` → **返回**：`{ messages: Message[] }`

`Message` 类型（两个历史工具共用）：`{ role: "user" | "agent", text: string, createdAt: string }`

### `search_memory`

检索记忆，支持时间范围过滤。

**参数**：`{ query: string, after?: string, before?: string, limit?: number }`

**返回**：`{ hits: MemoryHit[] }`，`MemoryHit` = `{ source: string, content: string, score: number }`

### `ask_user`

向用户提问（异步）。Teller 调用后立即退出，Supervisor 将问题呈现给用户；用户回复后再唤醒 Teller 注入答案。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | `string` | 是 | 问题内容 |
| `timeout` | `number` | 否 | 超时秒数，默认 `3600` |
| `default` | `string` | 否 | 超时后使用默认值 |
| `options` | `string[]` | 否 | 可选项列表 |

**返回**：`{ questionId: string }`

**pending_question.json 字段**：`questionId`、`question`、`options?`、`timeout`、`default?`、`createdAt`、`expiresAt`。

### `schedule`

创建持久化调度任务，写入 `triggers/`。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | `string` | 是 | 任务描述 |
| `type` | `"recurring" \| "scheduled" \| "conditional"` | 是 | 调度类型 |
| `interval` | `number` | 条件 | `recurring` 时必填，执行间隔（秒） |
| `runAt` | `string` | 条件 | `scheduled` 时必填（ISO 8601） |
| `condition` | `Condition` | 条件 | `conditional` 时必填 |
| `cooldown` | `number` | 否 | 冷却期（秒），默认 `0` |
| `timeout` | `number \| null` | 否 | 超时秒数 |
| `traceId` | `string` | 否 | 观测链路 ID；缺省由系统生成 |

**返回**：`{ triggerId: string }`

### `list_tasks`

查询任务状态。

**参数**：`{ scope?: "queue" | "running" | "triggers" | "all", role?: "planner" | "worker" }`

**返回**：`{ tasks: TaskSummary[] }`，`TaskSummary` = `{ id, type, prompt, priority, status, createdAt, traceId? }`

**status 枚举**：`queued` | `running` | `done` | `failed` | `trigger`

### `cancel_task`

取消队列任务或移除 trigger（对运行中任务不生效）。适用于用户发起的取消请求。

**参数**：`{ id: string }`（taskId 或 triggerId） → **返回**：`{ success: boolean }`

**取消规则**：

- `queued`：从 `queue/` 删除并返回 `success=true`
- `trigger`：从 `triggers/` 删除并返回 `success=true`
- `running`：不生效，返回 `success=false`

## 工具权限

| 工具 | Teller | Planner | Worker |
|------|-------|---------|--------|
| `delegate` | 可用（仅委派 Planner） | 可用（派发 Worker/Trigger） | 不可用 |
| `reply` | 可用 | 不可用 | 不可用 |
| `remember` | 可用 | 不可用 | 不可用 |
| `get_recent_history` | 不可用 | 可用 | 不可用 |
| `get_history_by_time` | 不可用 | 可用 | 不可用 |
| `search_memory` | 不可用 | 可用 | 不可用 |
| `ask_user` | 可用 | 不可用 | 不可用 |
| `schedule` | 不可用 | 可用 | 不可用 |
| `list_tasks` | 可用 | 可用 | 不可用 |
| `cancel_task` | 可用 | 可用 | 不可用 |

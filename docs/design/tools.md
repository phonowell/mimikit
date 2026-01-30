# 工具系统

> 返回 [系统设计总览](./README.md)

## 工具定义

### `delegate`

委派子任务。工具调用写入调用方对应的 `results/` 目录，由 Supervisor 路由至下游队列：

- **Teller 调用** → 写入 `planner/queue/`，Supervisor 派发 Planner。
- **Planner 调用** → 任务定义暂存于 Planner 结果中，Planner 退出后 Supervisor 统一解析并写入 `worker/queue/`。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | `string` | 是 | 任务描述 |
| `type` | `"oneshot" \| "conditional"` | 否 | 默认 `"oneshot"`。仅 Planner 可指定 |
| `condition` | `Condition` | 否 | `type="conditional"` 时必填。仅 Planner 可指定 |
| `priority` | `number` | 否 | 0-10，数值越大优先级越高，默认 `5`。仅 Planner 可指定 |
| `timeout` | `number \| null` | 否 | 超时秒数，`null` 使用角色默认值 |

**返回**：`{ taskId: string }`

### `reply`

回复用户。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 回复内容 |

**返回**：`void`

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

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `count` | `number` | 是 | 获取条数 |
| `offset` | `number` | 否 | 跳过最近 N 条，默认 `0` |

**返回**：`{ messages: Message[] }`

### `get_history_by_time`

按时间范围获取历史会话。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `after` | `string` (ISO 8601) | 是 | 起始时间（含） |
| `before` | `string` (ISO 8601) | 否 | 结束时间（含），默认当前时间 |

**返回**：`{ messages: Message[] }`

`Message` 类型（两个历史工具共用）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | `"user" \| "assistant"` | 发送方 |
| `text` | `string` | 内容 |
| `createdAt` | `string` (ISO 8601) | 时间戳 |

### `search_memory`

检索记忆，支持时间范围过滤。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | `string` | 是 | 搜索关键词 |
| `after` | `string` (ISO 8601) | 否 | 限定时间范围起点 |
| `before` | `string` (ISO 8601) | 否 | 限定时间范围终点 |
| `limit` | `number` | 否 | 最大返回条数，默认 `5` |

**返回**：`{ hits: MemoryHit[] }`

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | `string` | 来源文件路径 |
| `content` | `string` | 匹配内容（超 300 字符截断） |
| `score` | `number` | BM25 相关度评分 |

### `ask_user`

向用户提问。Teller 调用后立即退出，Supervisor 将问题呈现给用户；用户回复后 Supervisor 重新唤醒 Teller，将回复注入上下文。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | `string` | 是 | 问题内容 |
| `timeout` | `number` | 否 | 超时秒数，默认 `3600`（1 小时） |
| `default` | `string` | 否 | 超时后使用的默认值。未提供时超时将取消等待 |
| `options` | `string[]` | 否 | 可选项列表，限制用户回复范围（WebUI 可渲染为按钮） |

**返回**：`{ answer: string, source: "user" | "default" | "timeout" }`

**超时处理**：

| 场景 | 行为 |
|------|------|
| 提供 `default` | 超时后自动使用默认值继续，`source: "default"` |
| 未提供 `default` | 超时后取消问题，唤醒 Teller 告知超时，`source: "timeout"`，`answer: ""` |

**pending_question.json 扩展字段**：

```jsonc
{
  "question": "选择部署环境",
  "options": ["staging", "production"],
  "timeout": 1800,
  "default": "staging",
  "createdAt": "2026-01-31T10:00:00Z",
  "expiresAt": "2026-01-31T10:30:00Z"  // Supervisor 计算并写入
}
```

### `schedule`

创建持久化调度任务，写入 `triggers/`。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | `string` | 是 | 任务描述 |
| `type` | `"recurring" \| "scheduled" \| "conditional"` | 是 | 调度类型 |
| `interval` | `number` | 条件 | `recurring` 时必填，执行间隔（秒） |
| `runAt` | `string` (ISO 8601) | 条件 | `scheduled` 时必填，执行时间点 |
| `condition` | `Condition` | 条件 | `conditional` 时必填 |
| `cooldown` | `number` | 否 | 条件任务冷却期（秒），默认 `0` |
| `timeout` | `number \| null` | 否 | 超时秒数，`null` 使用角色默认值 |

**返回**：`{ taskId: string }`

### `list_tasks`

查询任务状态。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `scope` | `"queue" \| "running" \| "triggers" \| "all"` | 否 | 查询范围，默认 `"all"` |
| `role` | `"planner" \| "worker"` | 否 | 按角色过滤（仅 queue / running 有效） |

**返回**：`{ tasks: TaskSummary[] }`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 任务 ID |
| `type` | `string` | 任务类型 |
| `prompt` | `string` | 任务描述（截断至 100 字符） |
| `priority` | `number` | 优先级（0-10） |
| `status` | `"queued" \| "running" \| "trigger"` | 当前状态 |
| `createdAt` | `string` (ISO 8601) | 创建时间 |

### `cancel_task`

取消队列任务或移除 trigger。对运行中的任务不生效。

**参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `taskId` | `string` | 是 | 任务 ID |

**返回**：`{ success: boolean }`

## 工具权限

| 工具 | Teller | Planner | Worker |
|------|-------|---------|--------|
| `delegate` | 可用（仅委派 Planner） | 可用（派发 Worker） | 不可用 |
| `reply` | 可用 | 不可用 | 不可用 |
| `remember` | 可用 | 不可用 | 不可用 |
| `get_recent_history` | 不可用 | 可用 | 不可用 |
| `get_history_by_time` | 不可用 | 可用 | 不可用 |
| `search_memory` | 不可用 | 可用 | 不可用 |
| `ask_user` | 可用 | 不可用 | 不可用 |
| `schedule` | 不可用 | 可用 | 不可用 |
| `list_tasks` | 可用 | 可用 | 不可用 |
| `cancel_task` | 可用 | 可用 | 不可用 |

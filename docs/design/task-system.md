# 任务系统

> 返回 [系统设计总览](./README.md)

## Teller

### 启动注入

1. 固定声明：`"You are the Mimikit runtime teller."`
2. `docs/agents/teller.md`
3. 动态上下文：对话历史、记忆检索结果、用户输入、任务结果

### 唤醒流程

1. 读取待处理输入和待处理结果。
2. 结合对话历史与记忆，理解上下文。
3. 调用 `reply` 回复用户。
4. 若需执行任务，调用 `delegate` 委派 Planner。Teller 自身不做任务拆分。
5. 立即休眠。

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
任务写入 planner/queue/
  ↓
Supervisor 派发 Planner（注入 docs/agents/planner.md）
  ↓
Planner 拆分为子任务 → 结果写入 planner/results/
  ↓
Supervisor 检查 Planner 结果状态
  ├─ done → 子任务写入 worker/queue/
  └─ needs_input → 唤醒 Teller 向用户提问 → 用户回复后重新委派 Planner
        （不进入下方 Worker 流程）
  ↓（仅 done 分支继续）
Supervisor 派发 Worker（注入 docs/agents/worker.md）
  ↓
Worker 执行 → 结果写入 worker/results/
  ↓
Supervisor 唤醒 Teller 汇报结果

--- ask_user 分支 ---
Teller 调用 ask_user → 问题写入 pending_question.json → Teller 退出
  ↓
Supervisor 将问题呈现给用户（WebUI / inbox）
  ↓
用户回复 → Supervisor 唤醒 Teller（注入回复内容）
```

## 任务类型

| 类型 | 触发方式 | 执行后 | 调度方 |
|------|---------|--------|-------|
| **oneshot** | 立即 | 移除 | — |
| **recurring** | 固定间隔 | 保留，计算 nextRunAt | Supervisor（代码） |
| **scheduled** | 指定时间点 | 移除 | Supervisor（代码） |
| **conditional** | 条件满足 | 保留，进入冷却期 | 确定性：Supervisor（代码）；语义：按需批量派 Worker 评估（最小间隔 5 分钟） |

任务通用字段与各类型调度字段：

```jsonc
// 通用
{
  "id": "task-001",
  "type": "oneshot|recurring|scheduled|conditional",
  "prompt": "...",
  "priority": 5,       // 0-10，数值越大优先级越高，默认 5
  "createdAt": "...",
  "attempts": 0,
  "timeout": null
}

// recurring
{ "schedule": { "interval": 21600, "lastRunAt": null, "nextRunAt": null } }

// scheduled
{ "schedule": { "runAt": "2026-01-31T09:00:00Z" } }

// conditional（确定性）
{ "condition": { "type": "file_changed|task_done|task_failed|file_exists", "params": { ... } }, "cooldown": 3600 }

// conditional（语义）
{ "condition": { "type": "llm_eval", "params": { "prompt": "..." } }, "cooldown": 86400 }
```

任务结果统一格式：

```jsonc
{
  "id": "task-001",
  "status": "done|failed|needs_input",
  "resultType": "text|code_change|analysis|summary",  // 结果类型标识
  "result": { ... },     // 结构化结果（必须），schema 由 resultType 决定
  "error": "...",        // 仅失败时
  "question": "...",     // 仅 needs_input 时，需要用户回答的问题
  "attempts": 1,
  "completedAt": "..."
}
```

### 结果类型 Schema

| resultType | 适用场景 | Schema |
|------------|---------|--------|
| `text` | 通用文本回复、说明 | `{ text: string }` |
| `code_change` | 代码修改任务 | `{ files: [{ path, action, summary }], commitMessage?: string }` |
| `analysis` | 分析/调研任务 | `{ findings: string[], recommendations?: string[], references?: string[] }` |
| `summary` | 汇总/摘要任务 | `{ summary: string, keyPoints: string[], metadata?: object }` |

```jsonc
// 示例：code_change 类型
{
  "resultType": "code_change",
  "result": {
    "files": [
      { "path": "src/utils.ts", "action": "modified", "summary": "拆分 formatDate 函数" },
      { "path": "src/utils/date.ts", "action": "created", "summary": "新增日期工具模块" }
    ],
    "commitMessage": "refactor(utils): extract date utilities to separate module"
  }
}
```

所有任务（Planner / Worker / `llm_eval`）均必须产出结构化 `result`。串联任务中，下游任务的 prompt 注入前置任务的 `result`，使其可访问上游产出。Teller 根据 `resultType` 选择合适的呈现方式。

**`needs_input` 状态**：Planner 在任务拆分过程中若发现需要用户确认才能继续（如需求不明确、存在多种方案需用户选择），将结果状态设为 `needs_input`，`result` 填入已完成的分析上下文，`question` 填入需要用户回答的问题。Supervisor 收到后唤醒 Teller，Teller 通过 `ask_user` 与用户交互，获得答案后重新委派 Planner 并附带用户回复。

## 条件类型（Condition）

`Condition` 是 `delegate` 和 `schedule` 工具中条件任务的条件定义：

### 原子条件

```jsonc
{ "type": "file_changed",  "params": { "path": "string" } }
{ "type": "task_done",     "params": { "taskId": "string" } }
{ "type": "task_failed",   "params": { "taskId": "string" } }
{ "type": "file_exists",   "params": { "path": "string" } }
{ "type": "llm_eval",      "params": { "prompt": "string" } }
```

### 组合条件

支持 `AND` / `OR` 逻辑组合，可嵌套：

```jsonc
// AND：所有子条件均满足时触发
{
  "type": "and",
  "conditions": [
    { "type": "file_changed", "params": { "path": "src/**/*.ts" } },
    { "type": "task_done", "params": { "taskId": "lint-check" } }
  ]
}

// OR：任一子条件满足时触发
{
  "type": "or",
  "conditions": [
    { "type": "file_exists", "params": { "path": ".deploy" } },
    { "type": "task_done", "params": { "taskId": "manual-trigger" } }
  ]
}

// 嵌套示例：(A AND B) OR C
{
  "type": "or",
  "conditions": [
    {
      "type": "and",
      "conditions": [
        { "type": "file_changed", "params": { "path": "package.json" } },
        { "type": "task_done", "params": { "taskId": "install-deps" } }
      ]
    },
    { "type": "llm_eval", "params": { "prompt": "检查是否有紧急安全更新" } }
  ]
}
```

**评估规则**：

- `AND` 短路求值：遇到 `false` 立即返回，不继续评估。
- `OR` 短路求值：遇到 `true` 立即返回，不继续评估。
- 组合条件中包含 `llm_eval` 时，仅在确定性条件无法短路时才派发评估 Worker。

### 确定性条件

| type | Supervisor 判断方式 |
|------|-------------------|
| `file_changed` | `fs.stat` mtime 比较 |
| `task_done` | `worker/results/{taskId}.json` 存在且状态为 done |
| `task_failed` | `worker/results/{taskId}.json` 存在且状态为 failed |
| `file_exists` | `fs.existsSync` |

`task_done` / `task_failed` 在结果写入时即时评估，不等下一轮轮询。

### 语义条件

需要 LLM 介入判断。Supervisor 将所有待评估的语义条件**批量合并为一个评估 Worker**（prompt 模板：`docs/prompts/llm-eval-batch.md`），返回每个条件的 `true` / `false`，由 Supervisor 直接消费，不唤醒 Teller。

**调度规则**：

- **最小间隔 5 分钟**：Supervisor 每 5 分钟检查一次是否存在待评估的 `llm_eval` 条件（不在冷却期、未在评估中）。无待评估条件时不创建 Worker。
- **批量评估**：将所有待评估条件合并为单个 Worker 任务，一次性判断，避免创建多个评估 Worker。
- **优先级**：`llm_eval` 评估任务在 `worker/queue/` 中优先于普通任务派发，避免被长时间阻塞。

```jsonc
// 示例：代码质量恶化时自动重构
{
  "id": "quality-guard",
  "type": "conditional",
  "prompt": "重构超长函数，拆分到 50 行以内",
  "condition": {
    "type": "llm_eval",
    "params": { "prompt": "检查 src/ 下是否存在超过 50 行的函数" }
  },
  "cooldown": 86400
}
```

## 任务串联

条件性任务通过引用前置任务 id 形成流水线：

```jsonc
// A → B → C
{ "id": "A", "type": "oneshot", "prompt": "..." }
{ "id": "B", "type": "conditional", "prompt": "...", "condition": { "type": "task_done", "params": { "taskId": "A" } }, "cooldown": 0 }
{ "id": "C", "type": "conditional", "prompt": "...", "condition": { "type": "task_done", "params": { "taskId": "B" } }, "cooldown": 0 }
```

Planner 拆分复杂请求时，利用此机制编排有依赖关系的子任务。

## Planner

Planner 是任务拆分和编排的核心，介于 Teller 和 Worker 之间。

**启动注入**：

1. `docs/agents/planner.md`
2. Teller 委派时传递的上下文：用户原始请求、相关对话历史片段

**职责**：

1. **分析需求**：理解用户请求的完整意图，识别隐含的子目标。
2. **评估复杂度**：判断是否需要拆分，简单任务可直接派单个 Worker。
3. **拆分任务**：将复杂请求分解为可独立执行的子任务，每个子任务有明确的输入和预期输出。
4. **编排依赖**：决定子任务的执行顺序——可并行的用多个 oneshot，有依赖的用 conditional 串联（`task_done` 条件）。
5. **指派优先级**：根据任务紧急程度和用户意图设置 `priority`（0-10）。参考标准：用户明确催促或阻塞性任务 8-10；常规交互任务 5-7；后台/非紧急任务 1-4。
6. **评估时长**：对预期耗时较长的任务显式设置 `timeout`，避免因默认超时导致误杀。
7. **补充上下文**：若 Teller 反馈上下文不足，Planner 通过 `get_recent_history` / `get_history_by_time` / `search_memory` 获取更多信息，整理后派 Worker 生成补充回复。

**输出**：

- 通过 `delegate` 工具派发子任务，`result` 为结构化的子任务定义列表，写入 `planner/results/`。
- Supervisor 解析 `result`，将子任务写入 `worker/queue/`。
- 不生成面向用户的文本。
- 任务 prompt 应自包含，Worker 无需额外上下文即可执行。

**权限**：见 [工具权限](./tools.md#工具权限)。可用工具：`delegate`（派发 Worker）、`get_recent_history`、`get_history_by_time`、`search_memory`、`schedule`、`list_tasks`、`cancel_task`。

**典型场景**：

```
用户："帮我重构 src/utils.ts，拆分成多个小文件"

Planner 分析：
1. 先读取 src/utils.ts 了解结构 → Worker A
2. 根据功能分组，设计拆分方案 → Worker B（依赖 A）
3. 执行拆分，创建新文件 → Worker C（依赖 B）
4. 更新所有 import 引用 → Worker D（依赖 C）
5. 运行测试验证 → Worker E（依赖 D）

派发：
- A: oneshot
- B: conditional (task_done: A)
- C: conditional (task_done: B)
- D: conditional (task_done: C)
- E: conditional (task_done: D)
```

## Worker

Worker 是具体任务的执行者，通过 codex exec 独立运行。

**执行环境**：

- Worker 进程拥有完整的 shell access（codex exec sandbox 内），可执行文件读写、代码编辑、命令行工具调用等操作。
- Worker 不使用工具系统中定义的工具（`delegate`、`reply` 等均不可用），其能力完全来自 codex exec 提供的沙箱环境。

**启动注入**：

1. `docs/agents/worker.md`
2. 任务 prompt（由 Planner 生成，自包含）

**输出**：执行结果写入 `worker/results/{taskId}.json`，`result` 包含任务产出（分析结论、变更摘要等），由 Supervisor 路由至 Teller。

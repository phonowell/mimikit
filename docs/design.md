# 系统设计

## 设计原则

1. **LLM 只做需要智能的事**：理解意图、生成回复、分析需求、编写代码。所有可确定性执行的操作一律固化为内置操作。
2. **Teller 只做回复**：主 Teller 不执行任何耗时操作，只生成面向用户的回复并委派 Planner。
3. **文件协议通信**：所有进程间通信通过 `.mimikit/` 下的 JSON 文件完成。
4. **崩溃安全**：任何进程在任何时刻中断，系统重启后均可自动恢复。

## 系统角色

| 角色 | 性质 | 职责 |
|------|------|------|
| **Supervisor** | 常驻进程，纯代码 | 调度、派发、条件评估、记忆归档、内置操作执行 |
| **Teller** | LLM（codex exec） | 回复用户、委派 Planner |
| **Planner** | LLM（codex exec） | 分析需求、拆分任务、编排依赖 |
| **Worker** | LLM（codex exec） | 执行具体子任务 |

## 内置操作 vs LLM 操作

核心原则：**能用代码判断的，不用 LLM；能用代码执行的，不派任务。**

### 由 Supervisor 执行的内置操作（零 LLM 开销）

| 操作 | 实现方式 |
|------|---------|
| 任务调度（recurring / scheduled / conditional） | 时间比较、文件 stat、任务状态检查 |
| 记忆归档触发 | 条数统计 + 时间差计算 |
| 记忆 flush | `history.json` 长度 ≥ 800 且距上次 ≥ 1h |
| 记忆文件搬运（≤ 5 天） | 原样复制到 `memory/YYYY-MM-DD-slug.md` |
| 记忆汇总派发（> 5 天） | 直接派 Worker，不经 Teller |
| 历史会话注入裁剪 | token 预算逆序累加，截断长消息 |
| 历史消息去重 | `createdAt + text` 组合键 |
| 任务结果路由 | 写入 `results/`，触发条件性任务评估 |
| 状态恢复 | 从 `running/`、`queue/`、`results/` 推导 |
| 残留任务重派 | 扫描 `queue/` 自动派发 |
| 日志写入 | 追加 `log.jsonl` |
| 确定性条件评估 | `file_changed`、`task_done`、`task_failed`、`file_exists` |
| 下次执行时间计算 | `lastRunAt + interval` |
| 冷却期判断 | `lastTriggeredAt + cooldown > now` |
| Backlog 读取与格式化 | 解析 markdown checkbox |

### 需要 LLM 的操作（不可避免）

| 操作 | 由谁执行 | 说明 |
|------|---------|------|
| 回复用户 | Teller | 理解意图、生成自然语言回复 |
| 判断是否需要委派 Planner | Teller | 判断用户请求是否涉及任务 |
| 任务拆分与依赖编排 | Planner | 分析复杂度、决定并行/串联 |
| 执行具体任务 | Worker | 编写代码、分析问题等 |
| 记忆汇总（日/月摘要） | Worker | 需要理解内容、提炼摘要 |
| 语义条件评估（`llm_eval`） | Worker | 需要理解自然语言条件 |

## Supervisor 主循环

每 1 秒执行一次，按优先级：

1. **Teller 运行中？**（进程级判断，非文件） → 跳过，冻结唤醒。
2. **内置操作待执行？** → 执行（记忆归档、flush、确定性条件评估等）。
3. **有待派发任务？** → 派发 `queue/`（受 `maxConcurrency` 限制，默认 3）。
4. **调度任务到期？** → 检查 `triggers/`，到期任务移入 `queue/`。
5. **有未处理事务？**（用户输入 / 任务结果） → 唤醒 Teller。

## Teller

### 启动注入

1. 固定声明：`"You are the Mimikit runtime teller."`
2. `docs/runtime/teller.md`
3. 动态上下文：对话历史、记忆检索结果、用户输入、任务结果

### 唤醒流程

1. 读取待处理输入和待处理结果。
2. 结合对话历史与记忆，理解上下文。
3. 调用 `reply` 回复用户。
4. 若需执行任务，调用 `delegate` 委派 Planner。Teller 自身不做任务拆分。
5. 立即休眠。

## 任务系统

### 生命周期

```
用户输入
  ↓
inbox.json + history.json（Host 写入）
  ↓
Supervisor 唤醒 Teller
  ↓
Teller 回复用户 + 委派 Planner → 立即休眠
  ↓
Supervisor 派发 Planner（注入 docs/runtime/planner.md）
  ↓
Planner 拆分为子任务 → delegate 写入 queue/
  ↓
Supervisor 派发 Worker（注入 docs/runtime/worker.md）
  ↓
Worker 执行 → 结果写入 results/
  ↓
Supervisor 唤醒 Teller 汇报结果
```

### 任务类型

| 类型 | 触发方式 | 执行后 | 调度方 |
|------|---------|--------|-------|
| **oneshot** | 立即 | 移除 | — |
| **recurring** | 固定间隔 | 保留，计算 nextRunAt | Supervisor（代码） |
| **scheduled** | 指定时间点 | 移除 | Supervisor（代码） |
| **conditional** | 条件满足 | 保留，进入冷却期 | 确定性：Supervisor（代码）；语义：每 5 分钟派 Worker 评估 |

任务通用字段与各类型调度字段：

```jsonc
// 通用
{ "id": "task-001", "type": "oneshot|recurring|scheduled|conditional", "prompt": "...", "createdAt": "..." }

// recurring
{ "schedule": { "interval": 21600, "lastRunAt": null, "nextRunAt": null } }

// scheduled
{ "schedule": { "runAt": "2026-01-31T09:00:00Z" } }

// conditional（确定性）
{ "condition": { "type": "file_changed|task_done|task_failed|file_exists", "params": { ... } }, "cooldown": 3600 }

// conditional（语义）
{ "condition": { "type": "llm_eval", "params": { "prompt": "..." } }, "cooldown": 86400 }
```

### 确定性条件

| type | Supervisor 判断方式 |
|------|-------------------|
| `file_changed` | `fs.stat` mtime 比较 |
| `task_done` | `results/{taskId}.json` 存在且状态为 done |
| `task_failed` | `results/{taskId}.json` 存在且状态为 failed |
| `file_exists` | `fs.existsSync` |

`task_done` / `task_failed` 在结果写入时即时评估，不等下一轮轮询。

### 语义条件

需要 LLM 介入判断。Supervisor 每 5 分钟派发一个评估 Worker，返回 `true` / `false`，由 Supervisor 直接消费，不唤醒 Teller。

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

### 任务串联

条件性任务通过引用前置任务 id 形成流水线：

```jsonc
// A → B → C
{ "id": "A", "type": "oneshot", "prompt": "..." }
{ "id": "B", "type": "conditional", "prompt": "...", "condition": { "type": "task_done", "params": { "taskId": "A" } }, "cooldown": 0 }
{ "id": "C", "type": "conditional", "prompt": "...", "condition": { "type": "task_done", "params": { "taskId": "B" } }, "cooldown": 0 }
```

Planner 拆分复杂请求时，利用此机制编排有依赖关系的子任务。

### Planner

- **注入**：`docs/runtime/planner.md`（当前留空待补充）。
- **职责**：接收用户请求上下文，分析复杂度，拆分为子任务（oneshot 或 conditional 串联），通过 `delegate` 派发。
- **输出**：结构化任务列表，不面向用户。
- **权限**：可用 `delegate`、`get_history`、`search_memory`。

## 记忆系统

记忆统一存储在 `.mimikit/` 下：

- `memory.md` — 长期记忆
- `memory/` — 近期记忆（≤ 5 天原样保存）
- `memory/summary/` — 汇总记忆（日摘要 / 月摘要）

项目文档 `docs/` 也作为记忆检索范围，但不存放在 `.mimikit/` 中。

### 触发与归档

**触发条件**（Supervisor 内置判断）：对话历史超过 100 条，或距上次处理超过 6 小时。满足任一即触发。同时注册为 recurring 任务（间隔 6 小时）作为兜底。

**归档策略**：

| 时间范围 | 处理方式 | 位置 | 执行者 |
|---------|---------|------|--------|
| ≤ 5 天 | 原样搬运 | `memory/YYYY-MM-DD-slug.md` | Supervisor（代码） |
| 5 天 ~ 90 天 | 按日汇总 | `memory/summary/YYYY-MM-DD.md` | Worker（LLM） |
| > 90 天 | 按月汇总 | `memory/summary/YYYY-MM.md` | Worker（LLM） |

Supervisor 触发归档时：近期文件直接搬运（内置操作）；需要汇总的直接派 Worker（不经 Teller）。

**Flush**（Supervisor 内置执行）：对话 ≥ 800 条且距上次 ≥ 1h → 追加到 `memory/YYYY-MM-DD.md`。

### 检索与注入

Supervisor 在唤醒 Teller 前自动执行（代码）。

**关键词提取**：按优先级从两处提取——

1. `inbox.json` 中的待处理用户输入（最直接的意图信号）。
2. 最近 5 条历史会话（补充连续话题的上下文）。

提取方式：正则匹配中英文词组（`/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/gi`），过滤停用词，取前 6 个关键词。

**检索范围**（按优先级）：

1. `memory.md`（长期记忆，始终搜索）
2. `memory/` 近期文件（≤ 5 天）
3. `memory/summary/` 汇总文件
4. `docs/`（项目文档）

检索策略：BM25 评分，失败回退 `rg`。命中结果按相关度降序排列，逐条累加直到逼近 token 预算。无命中时不注入，不占用上下文空间。

**注入格式**：

```
## Memory
[memory.md] 用户偏好使用 pnpm 而非 npm。
[memory/2026-01-28-deploy.md] 上次部署使用了 Cloudflare Workers，遇到了超时问题……[truncated]
[docs/dev-conventions.md] 提交信息使用 conventional commits 格式。
```

每条命中带来源路径（方括号标注），内容超 300 字符截断。Teller 看到来源后如果需要完整内容，可委派 Planner 深入查询。

## 上下文注入预算

Supervisor 在唤醒 Teller 前自动执行（代码），历史会话和记忆各有独立的 token 预算：

| 注入项 | token 预算 | 硬性约束 |
|-------|-----------|---------|
| 历史会话 | 4096 | 5~20 条 |
| 记忆 | 2048 | 最多 5 条命中 |

### 历史会话

1. 从最近一条逆序累加 token 估算值，逼近预算时停止。
2. 硬性约束：最少 5 条，最多 20 条。
3. 单条超 500 字符截断，teller 回复优先截断。
4. 每条消息以 `createdAt` 为自然键，`createdAt + text` 去重。

Teller 只使用自动注入的历史和记忆，不主动查询更多。若上下文不足，Teller 先基于已有信息快速回复，同时委派 Planner 补充上下文后跟进。

## 工具系统

### 工具列表

| # | 工具 | 说明 |
|---|------|------|
| 1 | `delegate` | 委派子任务 |
| 2 | `reply` | 回复用户 |
| 3 | `remember` | 写入记忆 |
| 4 | `get_history` | 查看更多历史会话（按位置或时间范围） |
| 5 | `search_memory` | 检索记忆 |
| 6 | `update_backlog` | 更新 Backlog（add/done/remove） |
| 7 | `ask_user` | 向用户提问 |

### 工具权限

| 工具 | Teller | Planner | Worker |
|------|-------|---------|--------|
| `delegate` | 仅委派 Planner | 可用 | 不可用 |
| `reply` | 可用 | 不可用 | 不可用 |
| `remember` | 可用 | 不可用 | 不可用 |
| `get_history` | 不可用 | 可用 | 不可用 |
| `search_memory` | 不可用 | 可用 | 不可用 |
| `update_backlog` | 可用 | 不可用 | 不可用 |
| `ask_user` | 可用 | 不可用 | 不可用 |

## 文件协议

```
.mimikit/
├── inbox.json            # 用户输入队列
├── history.json          # 对话历史
├── memory.md             # 长期记忆
├── memory/               # 近期记忆
│   ├── YYYY-MM-DD-slug.md
│   └── summary/          # 汇总记忆（日摘要 / 月摘要）
│       ├── YYYY-MM-DD.md
│       └── YYYY-MM.md
├── queue/                # 待派发任务
│   └── {taskId}.json
├── triggers/             # 调度任务定义（recurring / scheduled / conditional）
│   └── {taskId}.json
├── running/              # 执行中任务
│   └── {taskId}.json
├── results/              # 任务结果
│   └── {taskId}.json
└── log.jsonl             # 日志（任务事件 + 审计事件，type 字段区分）
```

## 恢复机制

无状态文件，全部从目录内容推导。Supervisor 重启时：

- `running/` 非空 → 有任务在上次运行中中断，标记失败，移入 `results/`。
- `queue/` 非空 → 有待派发任务，继续派发。
- `results/` 非空 → 有未消费结果，唤醒 Teller 处理。
- `inbox.json` 有内容 → 有未处理用户输入，唤醒 Teller。

Teller 是否运行中由 Supervisor 进程级判断（子进程是否存活），不写文件。

## 实施计划

### 第一阶段：核心工具化

- 实现 `delegate` + `reply` 工具，替代 delegations 代码块正则解析。
- Teller 职责收窄为只回复 + 委派 Planner。
- Planner 作为独立任务类型，创建 `docs/runtime/planner.md`。

### 第二阶段：任务调度系统

- 实现四种任务类型（oneshot / recurring / scheduled / conditional）。
- Supervisor 内置实现所有确定性条件评估。
- 语义条件（`llm_eval`）每 5 分钟派 Worker 评估。
- 记忆归档注册为 recurring 任务。

### 第三阶段：记忆与历史优化

- 历史会话注入改为 token 预算制。
- 实现 `get_history` + `search_memory` + `remember` 工具。
- Flush 机制由 Supervisor 内置执行。
- 记忆汇总（日/月摘要）由 Supervisor 直接派 Worker 执行。

### 第四阶段：扩展工具

- 实现 `update_backlog` + `ask_user` 工具。
- 移除所有旧的正则解析 fallback。

## 关联文档

- 架构参考：`docs/minimal-architecture.md`
- Codex exec 备忘：`docs/codex-exec-reference.md`
- 运行时准则：`docs/runtime/teller.md`、`docs/runtime/worker.md`、`docs/runtime/planner.md`

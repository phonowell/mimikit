# 系统设计

> **文档定位**：本文档为系统重新设计方案，将取代当前实现（参见 `docs/minimal-architecture.md`）。当前代码仍运行旧架构，迁移计划见末尾"实施计划"章节。

## 子文档导航

| 文档 | 内容 |
|------|------|
| [supervisor.md](./supervisor.md) | 主循环、并发控制、恢复机制、超时与失败 |
| [task-system.md](./task-system.md) | 生命周期、任务类型、条件、Planner、Worker |
| [memory.md](./memory.md) | 记忆存储、归档、检索、上下文预算 |
| [tools.md](./tools.md) | 工具定义、权限表 |

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
| 历史长度限制 | `history.json` 超 200 条时移除最旧条目 |
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

### 需要 LLM 的操作（不可避免）

| 操作 | 由谁执行 | 说明 |
|------|---------|------|
| 回复用户 | Teller | 理解意图、生成自然语言回复 |
| 判断是否需要委派 Planner | Teller | 判断用户请求是否涉及任务 |
| 任务拆分与依赖编排 | Planner | 分析复杂度、决定并行/串联 |
| 执行具体任务 | Worker | 编写代码、分析问题等 |
| 记忆汇总（日/月摘要） | Worker | 需要理解内容、提炼摘要 |
| 语义条件评估（`llm_eval`） | Worker | 需要理解自然语言条件 |

## 文件协议

```
.mimikit/
├── inbox.json              # 用户输入队列
├── pending_question.json   # ask_user 待回复问题（Teller 写入，用户回复后清除）
├── history.json            # 对话历史
├── memory.md               # 长期记忆
├── memory/                 # 近期记忆
│   ├── YYYY-MM-DD-slug.md
│   └── summary/            # 汇总记忆（日摘要 / 月摘要）
│       ├── YYYY-MM-DD.md
│       └── YYYY-MM.md
├── planner/
│   ├── queue/              # Planner 待派发队列
│   │   └── {taskId}.json
│   ├── running/            # Planner 执行中（最多 1 个）
│   │   └── {taskId}.json
│   └── results/            # Planner 结果（Supervisor 内部消费）
│       └── {taskId}.json
├── worker/
│   ├── queue/              # Worker 待派发队列
│   │   └── {taskId}.json
│   ├── running/            # Worker 执行中（最多 3 个）
│   │   └── {taskId}.json
│   └── results/            # Worker 结果（唤醒 Teller）
│       └── {taskId}.json
├── triggers/               # 调度任务定义（recurring / scheduled / conditional）
│   └── {taskId}.json
└── log.jsonl               # 日志（任务事件 + 审计事件，type 字段区分）
```

## 实施计划

### 第一阶段：核心工具化

- 实现 `delegate` + `reply` 工具，替代 delegations 代码块正则解析。
- Teller 职责收窄为只回复 + 委派 Planner。
- Planner 作为独立角色，创建 `docs/agents/planner.md`。
- 实现超时监控与失败重试机制。

### 第二阶段：任务调度系统

- 实现四种任务类型（oneshot / recurring / scheduled / conditional）。
- 实现 `schedule` + `list_tasks` + `cancel_task` 工具。
- Supervisor 内置实现所有确定性条件评估。
- 语义条件（`llm_eval`）按需批量评估，优先级高于普通任务。
- 记忆归档作为 Supervisor 内置定时检查（纯代码计时器，非任务系统 recurring 类型）。

### 第三阶段：记忆与历史优化

- 历史会话注入改为 token 预算制。
- 实现 `get_recent_history` + `get_history_by_time` + `search_memory` + `remember` 工具。
- 记忆汇总（日/月摘要）由 Supervisor 直接派 Worker 执行。

### 第四阶段：扩展工具与交互

- 实现 `ask_user` 工具。
- 实现 `needs_input` 状态，支持 Planner 回退至 Teller 与用户交互。
- 移除所有旧的正则解析 fallback。

## HTTP 与 WebUI

上层实现，不在当前核心设计范围内。系统通过 HTTP 服务提供 WebUI 对话界面及状态查询、输入提交等 API，具体接口设计在核心架构稳定后补充。

## 关联文档

- 架构参考：`docs/minimal-architecture.md`
- Codex exec 备忘：`docs/codex-exec-reference.md`
- 运行时准则：`docs/agents/teller.md`、`docs/agents/worker.md`、`docs/agents/planner.md`
- Prompt 模板：`docs/prompts/daily-summary.md`、`docs/prompts/monthly-summary.md`、`docs/prompts/llm-eval-batch.md`

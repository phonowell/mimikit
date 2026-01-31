# Supervisor

> 返回 [系统设计总览](./README.md)

## 主循环

每 1 秒执行一次，按优先级：

1. **Teller 运行中？**（进程级判断） → 仅冻结会唤醒 Teller 的分支（`needs_input` / 结果回传 / 用户输入），其余步骤正常执行。
2. **内置操作待执行？** → 执行（记忆归档、历史长度限制、确定性条件评估等）。
3. **Planner 结果待处理？** → `done` → 解析子任务写入 `worker/queue/`；`needs_input` → 若 Teller 空闲则唤醒，否则延后；`failed` → 进入重试流程。
4. **有待派发 Planner？** → 若 Planner 未在运行且 `planner/queue/` 非空，派发一个。
5. **有待派发 Worker？** → 若 Worker 运行数 < 3 且 `worker/queue/` 非空，按优先级派发（先按 `priority` 降序，同优先级内来源于 `llm_eval` 条件的任务优先，再按 `createdAt` 升序）。
6. **调度任务到期？** → 检查 `triggers/`，按任务类型处理：`recurring` / `conditional` 触发为 oneshot 入队（保留 trigger 定义）；`scheduled` 到点后触发并移除。
7. **用户可见结果/输入待处理？** → 若 Teller 空闲则唤醒（`llm_eval` 等内部结果由 Supervisor 消费，不唤醒）。

## 内部结果判定（确定性）

Supervisor 通过以下规则判断结果是否“用户可见”，无需 LLM：

- 若 `sourceTriggerId` 指向的 trigger 为 `conditional` 且 `condition.type=llm_eval` → **内部结果**（不唤醒 Teller）。
- 其他结果默认 **用户可见**。

## 并发控制

| 角色 | 并发上限 | 说明 |
|------|------|------|
| Teller | 1 | 同一时刻只有一个 Teller 运行，保证回复顺序一致 |
| Planner | 1 | 同一时刻只有一个 Planner 运行，避免任务编排冲突 |
| Worker | 3 | 可并行执行多个独立子任务，提高吞吐 |

Planner 和 Worker 各自有独立的队列、运行目录、结果目录，互不干扰。

## 恢复机制

无状态文件，全部从目录内容推导。Supervisor 重启时：

- `planner/running/` 非空 → 标记失败，移入 `planner/results/`。
- `worker/running/` 非空 → 标记失败，移入 `worker/results/`。
- `planner/queue/` 非空 → 继续派发。
- `worker/queue/` 非空 → 继续派发。
- `planner/results/` 非空 → 解析子任务写入 `worker/queue/`。
- `worker/results/` 非空 → 更新 `task_status.json`，仅用户可见结果在 Teller 空闲时唤醒处理。
- `inbox.json` 有内容 → 唤醒 Teller。
- `history.json` 中存在 `archived: "pending"` → 回退为 `false`（归档中断，下次重新归档）。
- `pending_question.json` 存在 → 保留，等待用户回复后唤醒 Teller。

Teller 是否运行中由 Supervisor 进程级判断（子进程是否存活），不写文件。

## 任务结果索引与清理

- Worker 结果写入时，Supervisor 更新 `task_status.json`（字段与语义见 `docs/design/task-system.md`）。
- `task_done` / `task_failed` 条件基于 `task_status.json` 判断，避免依赖结果文件是否存在。
- Teller 消费结果后，可按保留策略清理 `worker/results/`（例如保留 7~30 天或按数量上限），不影响条件判断。

## 超时与失败

### 进程超时

Supervisor 监控所有 Planner / Worker 进程的运行时长，超时后 kill 进程，视为一次失败。

| 角色 | 默认超时 | 说明 |
|------|------|------|
| Teller | 3 min | 回复 + 委派，应快速完成 |
| Planner | 10 min | 含信息收集与任务拆分 |
| Worker | 10 min | 常规任务执行 |
| `llm_eval` 评估 | 2 min | 轻量批量判断 |

任务可通过 `timeout` 字段覆盖默认值（秒），Planner 拆分任务时应评估执行时长，对预期耗时较长的任务显式设置更大的 `timeout`。

**超时重试翻倍**：超时导致的重试，`timeout` 自动翻倍（如默认 600s → 重试时 1200s）。

Supervisor 在写入失败结果时补充 `failureReason`（`timeout|error|killed`）与 `error`，并记录重试原因到 `log.jsonl`。

### 失败重试

Planner 和 Worker 统一处理，规则相同：

1. **首次失败** → Supervisor 延迟 60s 后自动重试一次，不唤醒 Teller。超时失败时 `timeout` 翻倍。
2. **重试仍失败** → 标记为最终失败，写入对应 `results/`，唤醒 Teller 汇报。
3. **`task_failed` 条件** 仅在最终失败时触发，重试期间不触发。

任务 JSON 通过 `attempts` 字段追踪执行次数（入队为 0，开始执行时递增为 1，重试时在重新入队前递增）。

## 日志字段

`log.jsonl` 每行记录一个事件，建议包含以下字段（便于审计与排障）：

- `timestamp`（UTC ISO 8601）
- `event`（如 `task_started`/`task_completed`/`task_failed`/`task_retry`/`archive_triggered`）
- `taskId` / `traceId` / `parentTaskId`
- `attempts` / `durationMs` / `failureReason`

## 日志轮转

`log.jsonl` 采用大小 + 日期双因素轮转策略：

**触发条件**（满足任一即轮转）：

| 因素 | 阈值 | 说明 |
|------|------|------|
| 大小 | 10 MB | 防止单文件过大影响读写性能 |
| 日期 | 每日 00:00 | 按天归档，便于按日期检索 |

**轮转流程**：

1. 当前 `log.jsonl` 重命名为 `log.YYYY-MM-DD.jsonl`（同一天多次轮转追加序号：`log.YYYY-MM-DD.1.jsonl`）。
2. 创建新的空 `log.jsonl` 继续写入。
3. 归档文件压缩为 `.gz` 格式（异步，不阻塞主循环）。

**保留策略**：

- 保留最近 30 天的归档日志。
- 超过 30 天的归档自动删除。
- 总归档大小上限 500 MB，超出时从最旧开始删除。

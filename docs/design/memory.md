# 记忆系统

> 返回 [系统设计总览](./README.md)

## 记忆存储结构

目录树见 `docs/design/README.md` 的“文件协议”。此处仅补充记忆相关约定：

- `memory.md` — 长期记忆
- `memory/` — 近期记忆（≤ 5 天原样保存）
- `memory/summary/` — 汇总记忆（日摘要 / 月摘要）

## 记忆文件命名与 slug 规则

`memory/YYYY-MM-DD-{slug}.md` 的 `slug` 约束：

- 仅使用 ASCII 小写字符（`a-z0-9-`），长度 ≤ 32。
- 优先使用内容关键词生成 `kebab-case`；若无法生成，使用 `mem-{shortId}`（`shortId` 为 UUID/ULID 前 8 位）。
- 同日文件名冲突时，追加 `-{n}` 或 `-{shortId}` 保证唯一性。

## history.json

对话历史文件，同时用于 Teller 上下文注入和 WebUI 历史展示。

- **长度限制（软上限）**：目标最多 200 条。超出时从最旧的 `archived: true` 消息开始移除（Supervisor 每轮检查）。若仅存在 `archived: false/pending` 消息导致超限，允许短暂超过上限并立即触发归档，避免未归档数据丢失。
- **归档标记**：三态——`false`（未归档）、`"pending"`（归档中，防止被 200 条硬限制移除）、`true`（归档完成）。已完成的消息仍可用于展示，但不再被归档处理。
- **容量兜底（硬上限）**：当条数 > 300 或文件体积 > 10MB 时，优先移除最旧的 `archived: true` 记录；若仍超限，记录 `history_overflow` 事件并强制触发归档（不丢弃未归档消息）。
- **归档失败字段（可选）**：`archiveAttempts`、`archiveFailedAt`、`archiveNextAt` 用于记录退避与重试节奏。

## 触发与归档

**触发条件**（Supervisor 内置判断）：未归档消息超过 100 条，或距上次归档超过 6 小时。满足任一即触发。Supervisor 同时内置 6 小时定时检查作为兜底（非任务系统的 recurring 类型，纯代码计时器）。

**归档范围**：从上次归档标记到当前为止的所有未归档消息。

**归档流程**：

1. Supervisor 扫描 `history.json` 中 `archived: false` 的消息，立即标记为 `"archived": "pending"`（防止 200 条硬限制在异步汇总期间移除未归档消息），按日期分组。
2. 按消息年龄分别处理：

| 时间范围 | 处理方式 | 位置 | 执行者 |
|---------|---------|------|--------|
| ≤ 5 天 | 原样搬运 | `memory/YYYY-MM-DD-slug.md` | Supervisor（代码） |
| 5 天前 ~ 上月 | 按日汇总 | `memory/summary/YYYY-MM-DD.md` | Worker（LLM） |
| 上上月及之前 | 按月汇总 | `memory/summary/YYYY-MM.md` | Worker（LLM） |

> 示例：当前为 1 月 31 日，则 12 月的消息按日汇总，11 月及之前按月汇总；当 2 月 1 日时，12 月及之前按月汇总。

3. 各项处理完成后，将对应消息从 `"archived": "pending"` 更新为 `"archived": true`。若 Worker 汇总失败，回退为 `"archived": false` 以便下次归档重试。

**失败与退避**：

- Worker 汇总失败时，更新消息的 `archiveAttempts`（+1）与 `archiveFailedAt`，并计算 `archiveNextAt` 进行指数退避（建议 10m → 30m → 2h → 6h → 12h）。
- 达到最大尝试次数（建议 5 次）后，记录 `archive_backlog` 事件并延长退避间隔，避免频繁失败占用资源。

**汇总 prompt 模板**（见 `docs/prompts/`）：

- 日汇总：`docs/prompts/daily-summary.md`
- 月汇总：`docs/prompts/monthly-summary.md`

月汇总完成后，已合并的日摘要不再被检索，但保留源文件。判断规则：若 `memory/summary/YYYY-MM.md` 存在，则该月所有 `memory/summary/YYYY-MM-DD.md` 日摘要从检索中排除。

## 检索与注入

Supervisor 在唤醒 Teller 前自动执行（代码）。

**关键词提取**：按优先级从两处提取——

1. `inbox.json` 中的待处理用户输入（最直接的意图信号）。
2. 最近 5 条历史会话（补充连续话题的上下文）。

提取方式：正则匹配中英文词组（`/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/gi`），过滤停用词，取前 6 个关键词。

**检索范围**（按优先级）：

1. `memory.md`（长期记忆，始终搜索）
2. `memory/` 近期文件（≤ 5 天）
3. `memory/summary/` 汇总文件（排除已被月汇总覆盖的日摘要，见上文排除规则）

检索策略：BM25 评分（建议参数：`k1=1.2`，`b=0.75`，最小分阈值 `score>=0.2`），失败或无命中回退 `rg`。命中结果按相关度降序排列，逐条累加直到逼近 token 预算。无命中时不注入，不占用上下文空间。

**注入格式**：

```
## Memory
[memory.md] 用户偏好使用 pnpm 而非 npm。
[memory/2026-01-28-deploy.md] 上次部署使用了 Cloudflare Workers，遇到了超时问题……[truncated]
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
3. 单条超 500 字符截断，Teller 回复优先截断。
4. 每条消息以 `createdAt` 为自然键，`createdAt + text` 去重。

Teller 只使用自动注入的历史和记忆，不主动查询更多。若上下文不足，Teller 先基于已有信息快速回复，同时委派 Planner 补充上下文后跟进。

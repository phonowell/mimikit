# Memory 机制（当前实现）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- 本文档是 Memory 领域的单一主规范（single source of truth），覆盖数据结构、读写语义、刷新机制、评分策略与持久化。
- 涉及 Memory 的设计记录、提案、讨论稿仅作背景参考，不构成并行规范。
- 若与其他文档表述冲突，以本文档与对应实现代码（`src/memory/*`、`src/manager/action-apply-memory.ts`）为准。

## 核心结论

- `memory/MEMORY.md` 持久化仍是 Markdown，但内部读写按结构化条目（entry）处理。
- `remember_memory` 仅负责立即写入，不新增 `forget_memory` action。
- “遗忘”通过记住一条指令（如“xxx 信息应遗忘”）进入 memory refresh，由 LLM 在刷新输出 `delete_entry_ids` 执行删除。
- prompt 注入 `M:memory` 不再按文件原顺序，改为本地评分排序后按 budget 选择。
- 刷新压缩与 prompt 注入共用同一评分器（本地计算），不增加额外 LLM 调用次数。

## 数据结构与落盘

- 条目模型：`id/title/content/updatedAt/source`，可带 `category/dedupeKey/evidenceIds/focusHints`。
- 读写模块：
  - `src/memory/entry-types.ts`
  - `src/memory/entry-utils.ts`
  - `src/memory/entry-codec.ts`
- 落盘格式（canonical）：
  - heading：`## [memory-entry] (id:memory-...)`
  - metadata 行：`title/updated_at/source/...`
  - 空行后正文 `content`

## 立即记忆（remember）

- 入口：`remember_memory(content)`。
- 行为：
  - 生成稳定 `dedupeKey`
  - 命中同 key 时合并段落（`merged`）或无变化（`noop`）
  - 新条目为 `created`
- 回执：写入 `memory_remembered` system event（含 `entry_id/ref/operation`）。
- 代码：
  - `src/memory/remember-entry.ts`
  - `src/manager/action-apply-memory.ts`
  - `src/history/memory-events.ts`

## 刷新（refresh）与遗忘

- 触发：`managerTurn` 与上次完成轮次差值 `>=20`，单飞执行。
- 子进程单轮只调用一次 LLM，输出：
  - `entries[]`：新增/更新候选
  - `delete_entry_ids[]`：删除候选（必须是现存 entry id）
  - `harvest/curate/compress` 三阶段审计原因
- 应用补丁顺序：
  1. 先删 `delete_entry_ids`
  2. 再并入 `entries`
  3. 最后按评分 + 存储预算做压缩取舍
- 代码：
  - `prompts/manager/memory-refresh-single-call.md`
  - `src/memory/refresh/single-call.ts`
  - `src/memory/refresh/apply-patch.ts`
  - `src/memory/refresh/singleflight.ts`

## 评分、排序与取舍

- 评分器：`src/memory/entry-score.ts`
- 主要信号：
  - relevance（与当前上下文词重叠）
  - recency（更新时间）
  - reliability（source + evidence）
  - focus_match（focusHints 与 workingFocus 命中）
  - mention_boost（近期重复提及加分，带上限）
- 注入：`buildManagerPrompt` 中对 memory 先评分排序，再在 `memoryMaxBytes` 内选择。
- 压缩：`applyMemoryPatch` 在超预算时按同评分器保留高价值条目、丢弃低价值条目。

## 状态与持久化

- 运行态：`runtime.memoryRefresh`
  - `lastCompletedTurn`
  - `lastProcessedInputsCursor`
  - `lastProcessedResultsCursor`
  - `lastProcessedPlanUpdatedAt`
  - `lastRunAt`
  - `running`
  - `pending`
- 持久化：`runtime-snapshot.json` 保存检查点字段（`running/pending` 不持久化）。

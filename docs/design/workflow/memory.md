# Memory 机制（当前实现）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- 本文档是 Memory 领域的单一主规范（single source of truth），覆盖数据结构、读写语义、刷新机制、评分策略与持久化。
- 涉及 Memory 的设计记录、提案、讨论稿仅作背景参考，不构成并行规范。
- 若与其他文档表述冲突，以本文档与对应实现代码（`src/work/memory/*`、`src/policy/memory/*`、`src/policy/manager/action-apply-memory.ts`）为准。

## 核心结论

- `memory/MEMORY.md` 持久化仍是 Markdown，但内部读写按结构化条目（entry）处理。
- `remember_memory` 仅负责立即写入，不新增 `forget_memory` action。
- “遗忘”通过记住一条指令（如“xxx 信息应遗忘”）进入 memory refresh，由 LLM 在刷新输出 `delete_entry_ids` 执行删除。
- prompt 注入 `M:memory` 不再按文件原顺序，改为本地评分排序后按 budget 选择。
- 刷新压缩与 prompt 注入共用同一评分器（本地计算），不增加额外 LLM 调用次数。

## 数据结构与落盘

- 条目模型：`id/title/content/updatedAt/source`，可带 `category/dedupeKey/evidenceIds/focusHints`。
- 读写模块：
  - `src/work/memory/entry-types.ts`
  - `src/work/memory/entry-utils.ts`
  - `src/work/memory/entry-codec.ts`
- 落盘格式（canonical）：
  - heading：`## [memory-entry] (id:memory-...)`
  - metadata 行：`title/updated_at/source/...`
  - 空行后正文 `content`
- 读取阶段只接受 canonical heading；旧标题样式不会再被解析或自动迁移，写路径会直接报错而不是静默覆盖。

## 立即记忆（remember）

- 入口：`remember_memory(content)`。
- 行为：
  - 生成稳定 `dedupeKey`
  - 命中同 key 时合并段落（`merged`）或无变化（`noop`）
  - 新条目为 `created`
- 输入门禁：
  - `content` 必须是单行稳定 digest（`<=240 chars`）。
  - checklist、多行过程文本、协议标签与 `task-*/plan-*` 一类 runtime 引用会被拒绝，不进入长期 memory。
  - 只有当 `content` 被当前用户输入直接支撑，或近期用户历史已重复表达同一稳定规则/偏好时，才允许立即写入。
  - “当前阶段重点 / 当前项目 / 本轮安排”一类当前态信息应留在 `focus/state`，不进入长期 memory。
  - 不满足上述证据时，`remember_memory` 会被静默 suppress；不会写入 memory，也不会触发用户侧澄清回合。
  - 若 `remember_memory` 被 suppress，manager 不得继续沿用同轮文本里的“已记住/已写入长期记忆”断言；用户侧必须改为明确说明“当前未写入长期记忆”。
  - 若 correction round 因 `remember_memory` 失败而提前收口或达到上限，最终回复必须优先使用 failure feedback / fallback，不得回退到仍声称写入成功的上一轮原文。
- 回执：写入 `memory_remembered` system event（含 `entry_id/ref/operation`）。
- 代码：
  - `src/work/memory/remember-entry.ts`
  - `src/policy/manager/action-apply-memory.ts`
  - `src/persistence/history/memory-events.ts`

## 刷新（refresh）与遗忘

- 触发：`managerTurn` 与上次完成轮次差值 `>=20`，且 `signalVersion != lastProcessedSignalVersion` 时触发；当前 signal 只来自稳定的 `memory_remembered` system event，单飞执行。
- 单轮只调用一次 LLM，输出：
  - `entries[]`：新增/更新候选
  - `delete_entry_ids[]`：删除候选（必须是现存 entry id）
- 应用补丁顺序：
  1. 先删 `delete_entry_ids`
  2. 再并入 `entries`
  3. 最后按评分 + 存储预算做压缩取舍
- 代码：
  - `prompts/manager/memory-refresh-single-call.md`
  - `src/policy/memory/refresh/single-call.ts`
  - `src/policy/memory/refresh/apply-patch.ts`
  - `src/policy/memory/refresh/singleflight.ts`
- 输入边界：
  - refresh 只消费 `signals`；当前来源限定为稳定的 `memory_remembered` system event。
  - refresh 不再消费近期 `task.result.output`、plan 标题、待办摘要等过程态文本。
  - `memory_remembered` 一类稳定 system event 可作为 refresh 证据；短期任务推进、待办、调度策略、恢复步骤、用户原话不得进入长期 memory。

## 评分、排序与取舍

- 评分器：`src/policy/memory/entry-score.ts`
- 主要信号：
  - relevance（与当前输入、task 标题、focus digest 的词重叠）
  - recency（更新时间）
  - reliability（source + evidence）
  - focus_match（focusHints 与 workingFocus 命中）
  - mention_boost（近期稳定信号加分，带更严格上限）
- 注入：`buildManagerPrompt` 中对 memory 先评分排序，再在 `memoryMaxBytes` 内选择。
- 压缩：`applyMemoryPatch` 在超预算时按同评分器保留高价值条目、丢弃低价值条目。
- 禁止项：
  - 禁止把 task 进度、待办、调度策略、恢复步骤写入长期 memory。
  - 禁止依赖近期 task output / plan title 的重复出现来放大长期 memory 排序。

## 状态与持久化

- 运行态：`runtime.memoryRefresh`
  - `lastCompletedTurn`
  - `signalVersion`
  - `lastProcessedSignalVersion`
  - `lastRunAt`
  - `running`
  - `pending`
- 持久化：`runtime-snapshot.json` 只保存 `lastCompletedTurn/signalVersion/lastProcessedSignalVersion/lastRunAt` 检查点字段（`running/pending` 不持久化）；refresh 是否有增量仅由 `signalVersion` 与 `lastProcessedSignalVersion` 比较得出，不再依赖 `inputsCursor` 一类队列游标。

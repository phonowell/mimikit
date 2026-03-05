# Memory 机制（当前实现）

> 返回 [Workflow 索引](./task-and-action.md)

## 核心结论

- `memory` 不再通过 manager action 写入；`append_memory` 已移除。
- memory 刷新由后台子进程执行，触发条件为 `>=20` manager 轮次差值。
- 每次触发仅执行一轮子进程，且只调用一次 LLM。
- 当无可靠增量时返回 `noop`，不会强写 `MEMORY.md`。

## 触发与单飞

- 触发判定：`runtime.managerTurn - runtime.memoryRefresh.lastCompletedTurn >= 20`。
- 单飞规则：同一时刻最多一个刷新任务运行（`running`）。
- 合并规则：运行中若再次触发，仅置 `pending=true`，不并发、不排队挤压。

实现位置：
- `src/memory/refresh/trigger-policy.ts`
- `src/memory/refresh/singleflight.ts`

## 子进程与 Provider

- 子进程入口：`src/memory/refresh/subprocess.ts`
- 进程拉起：`src/memory/refresh/job-spawn.ts`
- 子进程使用 manager 同模型（`runtime.config.manager.model`），并固定走 direct `responses` provider（`openai-responses`）

## 单轮作业（单次 LLM 调用）

- 同一轮内完成三类工作：`harvest`（攫取）/`curate`（整理）/`compress`（压缩）。
- 子进程只发起一次模型调用，并返回：
  - 顶层 `mode + reason + entries[]`
  - 三类工作各自的 `mode + reason`（用于审计与日志）
- 若最终无可写入增量，返回 `mode=noop`。

实现模块：
- `src/memory/refresh/single-call.ts`
- `src/memory/refresh/subprocess.ts`

## Prompt 位置

- `prompts/manager/memory-refresh-single-call.md`

## 写入策略

- 写入目标：`.mimikit/memory/MEMORY.md`
- 写入方式：序列化写入 + 原子落盘，避免并发冲突。
- 去重：重复条目与空条目会被跳过。

实现位置：
- `src/memory/refresh/apply-patch.ts`
- `src/memory/store.ts`

## 状态与持久化

- 运行态字段：`runtime.memoryRefresh`
  - `lastCompletedTurn`
  - `lastProcessedInputsCursor`
  - `lastProcessedResultsCursor`
  - `lastProcessedPlanUpdatedAt`
  - `lastRunAt`
  - `running`
  - `pending`
- 持久化：`runtime-snapshot.json` 中保存检查点字段（不保存 `running/pending`）。

实现位置：
- `src/orchestrator/core/runtime-state.ts`
- `src/storage/runtime-snapshot-schema.ts`
- `src/orchestrator/core/runtime-persistence.ts`

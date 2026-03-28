# Implementation Plan: manager 空 reply 噪声修复

- Task: `task-86b952cfcfe64bcb95b7e4d9d365d3d9`
- Type: `tdd`
- Status: `completed`

## Phase 1 Scope and Root Cause Confirmation
- Entry: 已读取外置任务合同，但尚未把只读结论与当前代码状态、测试入口、worktree 基线统一起来。
- Exit: 明确空 reply 噪声的唯一修复落点仍是 `loop-batch.ts` 主回复链路，而不是 worker、history 投影或 manager error fallback。
- Verification: 记录只读归档、相关代码路径、基线测试命令与 worktree 状态。

## Phase 2 Failing Regression Tests
- Entry: 已确认最小修复边界。
- Exit: 至少两条失败测试覆盖 `worker_slot_freed` 与 `trigger_fire` 轮次在空 reply 下不再写入普通 agent fallback。
- Verification: 先运行针对性 vitest，观察失败原因与目标症状一致。

## Phase 3 Minimal Implementation
- Entry: 失败测试已锁定当前错误行为。
- Exit: manager 仅在 `worker_slot_freed` / `trigger_fire` 的 system-only 唤醒批次、且无 task result 可转述时允许空回复，不再注入 `继续处理。`。
- Verification: 针对性 vitest 通过，且直接结果 fallback、manager failure fallback 语义不回归。

## Phase 4 Quality Gates and Integration
- Entry: 代码与最小测试通过。
- Exit: 完成 code-reviewer 自复盘、`pnpm review-code-changes`、必要 git merge back 与清理。
- Verification: 记录 review 结论、门禁命令、merge/cleanup 结果；若失败则停在可审阅状态。

## Progress Log
- 2026-03-28: 已复核只读排查结论、定位 `loop-batch.ts` 空 reply fallback 注入点，并创建独立 worktree `task/manager-empty-reply-noise-fix-86b952cfcfe6`。
- 2026-03-28: 已先补失败测试，锁定 `worker_slot_freed` / `trigger_fire` 两类空 reply 噪声回归面。
- 2026-03-28: 已将 batch reply 决策拆到 `loop-batch-reply.ts`，在 system-only trigger wake 且无 result 时 suppress fallback agent reply。
- 2026-03-28: code-reviewer 自复盘未发现需继续修复的问题；`pnpm review-code-changes` 已通过。

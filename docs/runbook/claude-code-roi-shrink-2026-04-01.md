# claude-code ROI shrink 2026-04-01

## Context

- Source archive: `.mimikit/tasks/2026-04-01/task-4c58237e07454d5b962751312fc7e54c_claude-code-mimikit.md`
- Goal: remove overdesigned claude-code borrow ideas and land only the smallest high-ROI items that still fit mimikit's current single-session orchestration boundary.

## Keep

1. True read-only worker enforcement
   - Landed as provider-level sandbox selection instead of a bespoke shell allowlist.
   - Why kept: it closes a real safety gap for read tasks without introducing a second permission policy surface.
   - Code:
     - `src/execution/providers/types.ts`
     - `src/execution/providers/codex-sdk-provider-helpers.ts`
     - `src/execution/worker/profiled-runner.ts`

2. Deterministic live progress summaries
   - Landed by splitting audit activity from user-facing live output. Raw command/output snippets still persist in `worker_activity`, while `worker_live_output` and runtime live output keep compact summaries.
   - Why kept: it improves WebUI/archive readability immediately and reuses existing task-progress plumbing.
   - Code:
     - `src/execution/worker/live-output.ts`
     - `src/execution/worker/task-progress-write.ts`

## Drop

1. Manager headroom controller
   - Stop reason: safe landing needs token-limit policy, retry/circuit-breaker state, and manager fallback behavior beyond this task's minimal scope.
   - Evidence:
     - `src/policy/manager/context-budget.ts`
     - `src/policy/manager/loop-batch-exec.ts`
     - `src/policy/prompts/build-prompts.ts`

2. Continue-vs-spawn resume strategy
   - Stop reason: requires manager action-policy changes plus runtime state/evidence plumbing, not a local shrink.
   - Evidence:
     - `src/execution/worker/resume-task.ts`
     - `src/execution/worker/run-task.ts`

3. Transcript retain/evict lifecycle
   - Stop reason: archive/live-output split already gives a low-cost baseline; full lifecycle control would require broader WebUI/runtime ownership changes.
   - Evidence:
     - `src/surface/http/routes-api-task-archive.ts`
     - `src/surface/read-model/task-view.ts`

## Verification

- Targeted red-green:
  - `pnpm vitest run tests/codex-sdk-provider-resource-mode.test.ts tests/task-live-output-summary.test.ts tests/worker-run-task-incomplete-result.test.ts tests/worker-profiled-runner-provider/logging-scenarios.test.ts`
  - `pnpm vitest run tests/codex-stream-output-schema.test.ts tests/task-progress-live-output.test.ts tests/messages-route/archive-live-output-scenarios.ts tests/worker-run-retry-model-resource-mode.test.ts`
- Repo gate:
  - `pnpm run review-code-changes`

## Git truth

- Current branch: `task/claude-code-roi-7623003790`
- `pnpm run review-code-changes` passed in this worktree.
- Merge back to `main` and worktree cleanup were not executed here because `main` is checked out in `/Users/mimiko/Projects/mimikit`, outside the runtime write boundary for this task. Under the current workflow model, that remaining work belongs in a repo-root closure follow-up task rather than by holding the source task open.

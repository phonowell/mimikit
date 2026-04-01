# Claude-Code Four-Track Closure 2026-03-31

## Scope

- Goal: audit and close the four priority tracks derived from `task-c983d35a7d1241a7a252daebab732d47`.
- Constraint: current worker runtime may only write inside this worktree, so merge-back and external worktree cleanup remain out of scope for this run.

## Repo Truth Check

- `task-0182c0bb598840a098e948c287091819` claimed the "long-task output to disk" slice had already landed.
- Current repo truth contradicted that archive:
  - `main`, `task/claude-code-907b76e08a`, and `task/claude-code-mimikit-roi-0081429e92` all started from `fe06a5b7`.
  - The codebase did not contain `worker_live_output` or any persisted live-output fallback reader before this run.
- Decision: treat the archive as stale evidence and close the gap against current code instead of trusting the prior claim.

## Four Tracks

### 1. Synchronous State Gate

- Status: already implemented.
- Evidence:
  - `src/execution/worker/dispatch.ts`
  - `src/execution/worker/queued-run.ts`
  - `src/work/orchestrator/task-worker-run-write.ts`
  - `src/work/shared/task-execution-target.ts`
- Self-review:
  - Fits project goal: yes. It keeps the orchestrator on a small, synchronous truth source instead of UI-derived state.
  - Overdesign risk: low. The gate is just `runningControllers + runningTaskLocks + dispatchLockKey`.
  - Capability impact: prevents duplicate write-task dispatch on the same branch/worktree target.

### 2. Structured Recovery State

- Status: already implemented.
- Evidence:
  - `src/work/spec/store.ts`
  - `src/execution/prompts/build-worker-task-prompt.ts`
  - `src/execution/prompts/build-worker-prompt.ts`
  - `src/execution/worker/resume-task.ts`
- Self-review:
  - Fits project goal: yes. Recovery state stays structured as `executionSpec`, `resumeInstruction`, and `runtime_contract` instead of bloating `focus`.
  - Overdesign risk: low to medium. It adds a few narrow fields, not a second state system.
  - Capability impact: makes resumed worker runs recoverable without replaying full raw history into the main thread.

### 3. Worktree Runtime Facts

- Status: already implemented.
- Evidence:
  - `src/execution/prompts/worker-runtime-contract.ts`
  - `src/work/shared/task-git-lifecycle.ts`
  - `docs/design/workflow/task.md`
- Self-review:
  - Fits project goal: yes. Worktree/branch facts are projected from runtime and repo-local reconcile, not guessed from prompt text.
  - Overdesign risk: low. The worker only receives read-only facts already known to runtime.
  - Capability impact: narrows write boundaries and keeps git closure aligned with repo truth.

### 4. Long-Task Output To Disk

- Status before this run: missing in current repo.
- Gap:
  - Worker partial output only wrote `worker_activity`.
  - `/api/tasks/:id/archive` could only use in-memory `liveOutput`; after restart or reconnect it fell back to a generic placeholder.
- Landed change:
  - `src/execution/worker/run-task.ts` now appends a separate `worker_live_output` progress event alongside `worker_activity`.
  - `src/persistence/storage/task-progress.ts` now exposes `readLatestTaskLiveOutput`.
  - `src/surface/http/routes-api-task-archive.ts` now falls back to the latest persisted `worker_live_output` summary from the current run when runtime memory has no live output.
  - Docs updated in `docs/BOOTSTRAP.md` and `docs/design/workflow/interfaces-and-state.md`.
  - Regression coverage added in:
    - `tests/worker-run-task-incomplete-result.test.ts`
    - `tests/messages-route/archive-live-output-scenarios.ts`
- Self-review:
  - Fits project goal: yes. It improves long-task observability and restart resilience without adding a new state layer.
  - Overdesign risk: low. Reuses existing `task-progress` storage instead of introducing a separate artifact subsystem.
  - Capability impact: archive live fallback now survives loss of in-memory `liveOutput` and still avoids leaking raw `worker_activity`.

## Verification

- `code-reviewer`: reviewed the final diff; no remaining P0/P1/P2 findings after tightening the persisted-live-output fallback to the current run boundary.
- `pnpm vitest run tests/worker-run-task-incomplete-result.test.ts`
- `pnpm vitest run tests/messages-route.test.ts`
- `pnpm vitest run tests/task-progress-live-output.test.ts`
- `pnpm run review-code-changes`

## Remaining Boundary

- Merge back to `main` and worktree/branch cleanup were not executed here because the worker runtime contract only allows writes inside the current worktree. Those steps need a follow-up session with authority over the main worktree and external cleanup targets.

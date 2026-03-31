# Runtime Git Reconcile Shrink 2026-03-31

## Goal

- Land the archived shrink decision for runtime git closure in this worktree.
- Keep only repo-local reconcile from filesystem/git truth.
- Remove manager-facing and worker-facing lifecycle writeback paths that could mutate git closure state directly.

## Boundary Before vs After

### Before

- Manager action surface exposed `record_task_git`.
- Validation, intent-evidence, prompt templates, and feedback hints all carried explicit git lifecycle writeback protocol.
- Runtime accepted worker `handoff.git_lifecycle` writes and merged them into `Task.git.lifecycle`.
- Explicit writeback path also synced task archive git lifecycle projection.

### After

- `record_task_git` is removed from manager schema, registry, prompts, validation, and related tests.
- Worker `handoff.git_lifecycle` is no longer used to mutate task lifecycle state.
- Repo-local reconcile remains the only truth source for `Task.git.lifecycle`.
- Hydrate/persist reconcile now best-effort syncs archive git projection from reconciled task handoff, so `task/handoff/archive/snapshot` stay aligned without explicit lifecycle actions.

## Actual Changes

- Deleted explicit runtime git writeback implementation:
  - `src/execution/worker/record-task-git-lifecycle.ts`
  - `src/execution/worker/task-git-lifecycle-artifacts.ts`
  - `src/policy/manager/action-feedback-mutate-task-git-hints.ts`
- Removed `record_task_git` from:
  - manager action schema, registry, prompt specs, action surface prompt, system prompt
  - validation, intent-evidence guard, feedback/evidence hints
  - workflow docs and git-writeback-specific tests
- Tightened runtime result handling:
  - `src/execution/worker/task-handoff-protocol.ts` ignores worker-provided `git_lifecycle`
  - `src/execution/worker/result-finalize.ts` and `src/work/orchestrator/task-result-write.ts` project repo-local reconcile into handoff/task instead of trusting worker writes
  - `src/kernel/orchestrator/runtime-persistence.ts` syncs reconciled archive git projection during hydrate/persist

## Tests And Gates

- Added/updated focused regression coverage:
  - manager action surface no longer exposes `record_task_git`
  - manager prompt no longer renders `record_task_git`
  - manager turn parsing rejects removed `record_task_git`
  - worker structured handoff ignores `git_lifecycle` writes
  - runtime hydrate/persist reconcile also updates archive git projection
  - finalizeResult keeps repo-local reconcile as git lifecycle truth source
- Removed obsolete tests that only exercised explicit git writeback flow.
- Code review:
  - Manual `code-reviewer` pass on current diff found one real regression risk: archive projection stopped updating after external git changes. Fixed by syncing archive projection during hydrate/persist reconcile.
- Gate status:
  - `pnpm run review-code-changes`: passed
  - Branch merge / cleanup: completed locally

## Risks And Limits

- Archive projection sync is best-effort. If execution spec is missing, reconcile still fixes task/handoff/snapshot, but archive projection is skipped.
- Repo-local reconcile still assumes current repository conventions like review sentinel and `main` ancestor checks.
- Historical docs or archives may still mention `record_task_git`; current runtime contract no longer supports it.

## Git Lifecycle Status

- Worktree branch: `task/wt-runtime-git-dc21db49ec` (cleaned)
- Review gate: passed via `pnpm run review-code-changes`
- Merge back to `main`: completed at `ff5680dec42cce532da89df221b241c82380d64f`
- Worktree cleanup: completed

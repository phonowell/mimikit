# manager token worktree-loss retry report

## conclusion

- `task-6f8be41d56454d2fb9f934c13e5d42b9` did not fail because the manager token landing work itself was incomplete.
- The work finished, passed gates, merged to `/Users/mimiko/Projects/mimikit` and removed its worktree by `2026-03-31T10:15:45Z`.
- The recorded failure happened later, at `2026-03-31T10:20:00Z`, when a transient Codex stream disconnect triggered a retry that reused the deleted `task.cwd` `/Users/mimiko/Projects/mimikit-task-wt-manager-token-d975c395ad-f320da01`.
- The second provider attempt then failed immediately with `Codex Exec exited with code 1: Error: No such file or directory (os error 2)`.

## evidence

- `.mimikit/task-progress/2026-03-31/task-6f8be41d56454d2fb9f934c13e5d42b9.jsonl`
  - shows `pnpm review-code-changes` passing, fast-forward merges into `/Users/mimiko/Projects/mimikit`, and `git worktree remove /Users/mimiko/Projects/mimikit-task-wt-manager-token-d975c395ad-f320da01`.
- `.mimikit/log.jsonl`
  - `2026-03-31T10:20:00.521Z`: transient reconnect failure on task `task-6f8be41d56454d2fb9f934c13e5d42b9`.
  - `2026-03-31T10:20:05.605Z`: retry attempt fails against the same deleted working directory with `os error 2`.
- `.mimikit/traces/2026-03-31/0mnegu1d1wn.txt`
  - final archived provider error for the failed task.

## fix

- Added `src/execution/worker/task-cwd-preflight.ts`.
- `src/execution/worker/run-retry.ts` now checks that `task.cwd` is still a directory before every provider attempt.
- If the path is gone, the worker now stops with a non-retryable provider preflight error instead of spawning another Codex exec against a missing worktree.

## verification

- `pnpm vitest run tests/worker-task-cwd-preflight.test.ts tests/worker-run-retry-session.test.ts tests/worker-run-retry-resume-instruction.test.ts`
- `pnpm type-check`
- `pnpm review-code-changes`

## remaining boundary

- This fix makes the failure mode explicit and prevents a misleading second provider launch.
- A worker that deletes its assigned worktree before emitting the final JSON result can still end in a failed task state; avoiding that entirely would require a larger lifecycle change that defers cleanup until after result finalization.

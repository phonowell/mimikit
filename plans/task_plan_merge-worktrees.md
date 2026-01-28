# Task Plan: merge-worktrees

## Goal
- Safely merge all branch/worktree content into main, resolve conflicts, and clean branches/worktrees.

## Steps
1. Inventory branches/worktrees and dirty states; capture diffs for `task-compact`, `task-compact-auto`, and `review-ledger-compact-ts`.
2. In `task-compact-auto`, stage + commit intended changes (exclude ephemeral plan files if desired).
3. Merge `review-ledger-compact-ts` into `main` via `git merge --squash`, resolve conflicts, verify diffs.
4. Merge `task-compact-auto` into `main` via `git merge --squash`, resolve conflicts, verify diffs.
5. Cleanup: remove worktrees, delete local branches, prune; remove `.worktrees` dir if empty.
6. Record task status in `tasks.md` and update notes.

## Status
- ✓ Step 1 complete
- ✓ Step 2 complete
- ✓ Step 3 complete
- ✓ Step 4 complete
- ✓ Step 5 complete
- ✓ Step 6 complete

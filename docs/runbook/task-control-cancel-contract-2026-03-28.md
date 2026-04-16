# task_control(cancel) contract alignment

> Historical note (2026-04-16): this contract fix remains accurate, but references below to `intent-evidence` describe the pre-2026-04-15 guard chain rather than the current simplified manager authorization model.

## Root cause

- `src/policy/manager/manager-turn-schema.ts` required `task_control.instructions` for every action shape.
- `prompts/manager/action-surface.md` repeated that `task_id,action,instructions[]` were mandatory.
- Runtime consumers only read `instructions` for `action="resume"`, and validation already rejected non-resume actions that carried non-empty instructions.

## Contract decision

- `task_control` now requires only `task_id` and `action`.
- `instructions[]` is optional and only meaningful for `action="resume"`.
- `cancel` and `pause` can now be constructed without placeholder arrays.

## Changed surface

- Relaxed `task_control` schema in `src/policy/manager/manager-turn-schema.ts`.
- Normalized runtime access with `item.instructions ?? []` in validation, the then-existing guard checks, and apply path.
- Updated prompt surface text so manager guidance matches the executable contract.
- Added regression coverage for parsing cancel-without-instructions, prompt wording, and end-to-end apply of cancel.

## Verification

- Red phase: `pnpm -s vitest --run tests/manager-turn.test.ts tests/manager-action-surface-prompt.test.ts tests/manager-action-apply.test.ts`
  - failed before the fix because cancel without `instructions` violated the schema and prompt assertions still reflected the old contract.
- Green phase: same command passed after the fix.
- Gate: `pnpm review-code-changes`
  - passed, including lint, changed-test lint, type-check, webui build, and full Vitest suite (`133` files / `408` tests).

## Git status

- Fix commit: `eebf0041` (`fix: align task_control cancel contract`)
- Merge-back to `main` was not completed in this worktree because `main` is currently checked out at `/Users/mimiko/Projects/mimikit`, and `git branch -f main eebf0041` was rejected.

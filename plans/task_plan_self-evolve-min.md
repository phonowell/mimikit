# Task Plan: self-evolve-min

Status: in-progress

Goal
- Merge self-evolve additions into modular runtime while preserving existing architecture.

Scope
- Resolve merge conflicts and integrate score/guard/metrics/lessons/trigger flow.
- Keep changes minimal and aligned with current runtime/master split.

Steps
1) Resolve conflicts and ledger/http wiring.
   - ./src/runtime/ledger.ts:1
   - ./src/runtime/ledger/format.ts:1
   - ./src/runtime/ledger/store.ts:1
   - ./src/server/http.ts:1
2) Integrate self-evolve flow into modular runtime.
   - ./src/runtime/master.ts:1
   - ./src/runtime/master/helpers.ts:1
   - ./src/runtime/master/task-runner.ts:1
   - ./src/runtime/master/task-loop.ts:1
3) Validate behavior and data flow.
   - ./src/runtime/metrics.ts:1
   - ./src/memory/lessons.ts:1
4) Verify and finalize.
   - ./tests/metrics-summary.test.ts:1
   - pnpm lint, pnpm exec tsc -p tsconfig.json --noEmit, pnpm test
   - review-code-changes loop
   - worktree cleanup

Risks
- fire-keeper dependency not present; may need fallback to existing utils.

Progress
- [x] Step 1
- [x] Step 2
- [x] Step 3
- [x] Step 4

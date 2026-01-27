# Task Plan: prune-roi

## Goal
- Remove low-ROI components while keeping WebUI and minimal self-evolve.

## Scope
- Keep WebUI assets and routing.
- Keep minimal self-evolve: verifyCommand + retry loop + failure follow-up.
- Remove metrics/stats, lessons log, guard/score/objective features, queueWarnMs.

## Files
- src/config.ts
- src/cli.ts
- src/cli/args.ts
- src/server/http.ts
- src/runtime/master.ts
- src/runtime/master/task-runner.ts
- src/runtime/master/task-loop.ts
- src/runtime/master/helpers.ts
- src/runtime/ledger/types.ts
- src/runtime/ledger/format.ts
- src/runtime/ledger/store.ts
- tests/cli-args.test.ts
- src/runtime/metrics.ts (delete)
- src/memory/lessons.ts (delete)
- src/runtime/git.ts (delete)
- tests/metrics-summary.test.ts (delete)

## Steps
1. Confirm minimal self-evolve contract (verify-only loop + failure follow-up) and update TaskRequest/TaskRecord/API surfaces.
2. Remove metrics/lessons/guard/score from runtime/config/CLI/HTTP; delete unused modules.
3. Simplify ledger formatting/parsing and tests; ensure WebUI unchanged.

## Status
- current: 3/3
- last_updated: 2026-01-27

## Decisions
- minimal self-evolve = verifyCommand-driven retries + failure follow-up only.

## Risks
- Removing /stats and metrics breaks any client relying on them.
- Removing guard/score changes retry behavior for existing workflows.

## Progress Log
- 2026-01-27: Plan created.
- 2026-01-27: Implemented minimal self-evolve and removed metrics/lessons/guard/score.

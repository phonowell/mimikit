# Task Plan: review-ledger-compact-ts

## Goal
- Resolve TypeScript noUncheckedIndexedAccess errors in ledger compaction.
- Re-verify lint, type-check, and tests after the fix.

## Scope
- Ledger compaction loop in `src/runtime/ledger/store.ts`.
- Lint/type-check/test execution only.

## Steps
1. Create working branch and confirm failing type-check location.
2. Fix compaction loop to guard undefined records.
3. Run lint, type-check, and test.

## Status
- current: 3/3
- last_updated: 2026-01-28

## Progress Log
- 2026-01-28: Branch created; type-check failure confirmed.
- 2026-01-28: Guarded ledger compaction loop against undefined records.
- 2026-01-28: Ran lint, type-check, and test.

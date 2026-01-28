# notes_issues-jan28-2

- Focus on data durability, concurrency safety, and runaway processes.

## urgent issues (10)
1. sessions.json write is non-atomic; crash can corrupt session store. (fix)
2. tasks.md appends can interleave under concurrency; ledger corruption risk. (fix)
3. tasks.md compaction writes non-atomically; crash can truncate ledger. (fix)
4. worker timeout only SIGTERM; hung child can leak resources. (fix)
5. enqueueTask accepts empty sessionKey/prompt (non-HTTP callers) -> invalid tasks. (fix)
6. memory search can load unlimited rg/grep hits before trimming; memory spike risk.
7. loadTaskLedger parses entire file into memory; large ledger can spike memory.
8. readJson lacks slowloris protection (no per-request timeout) on POST /tasks.
9. output file read has no size cap; very large output can spike memory.
10. verify command parsing doesn't handle environment variable expansion; surprising for users.

## top 5 ROI
- 1,2,3,4,5 (data durability + concurrency + runaway process + input validation).

## testing
- lint: pnpm exec eslint "src/**/*.ts" (ok)
- typecheck: pnpm exec tsc -p tsconfig.json --noEmit (ok)
- test: pnpm exec vitest run --passWithNoTests (ok; no test files)

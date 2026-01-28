# notes_issues-jan28-3

- Focus on safety/perf caps, prompt bloat, and filesystem limits.

## urgent issues (10)
1. POST /tasks body has no read timeout (slowloris risk). (fix)
2. Memory search can return unbounded matches before trimming. (fix)
3. Worker output file read has no size cap; potential memory spike. (fix)
4. Retry prompt echoes full previous output; prompt bloat risk. (fix)
5. Transcript filename can exceed FS limits with long sessionKey. (fix)
6. Task ledger load parses entire file; large ledger memory spike.
7. Transcript append writes full outputs; storage bloat risk.
8. verify env uses raw output; newlines can break scripts.
9. No per-request timeout for other HTTP endpoints.
10. No upper bound on task ledger file growth until compaction triggers.

## top 5 ROI
- 1,2,3,4,5 (timeouts/caps + prompt bloat + FS safety).

## testing
- lint: pnpm exec eslint "src/**/*.ts" (ok)
- typecheck: pnpm exec tsc -p tsconfig.json --noEmit (ok)
- test: pnpm exec vitest run --passWithNoTests (ok; no test files)

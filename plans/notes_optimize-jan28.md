# notes_optimize-jan28

- Focus on small, high-leverage safety/perf improvements: request size cap, config normalization, memory path dedupe, bounded buffering for worker/verify outputs.

## optimization candidates
1. Add HTTP request body size limit to prevent oversized payloads (implemented).
2. Validate resumePolicy/codexSandbox from env/config with safe fallbacks (implemented).
3. Deduplicate/normalize memoryPaths to reduce redundant searches (implemented).
4. Cap worker stdout/stderr buffering to avoid memory blowups on verbose streams (implemented).
5. Cap verify command stdout/stderr buffering to avoid memory blowups (implemented).
6. Normalize env payloads (e.g., MIMIKIT_LAST_OUTPUT) to single-line to avoid env bloat.
7. Add per-session queue depth metrics in health stats.
8. Use atomic write for task ledger compaction to avoid partial writes.
9. Preflight codex binary existence to return clearer errors before spawn.
10. Surface JSON parse errors with a structured error payload (line/column).

## validation
- No automated tests run (no non-fix lint or typecheck scripts available without side effects).

## testing
- lint: pnpm exec eslint "src/**/*.ts" (ok)
- typecheck: pnpm exec tsc -p tsconfig.json --noEmit (ok)
- test: pnpm exec vitest run (fails: no test files)
- test: pnpm exec vitest run --passWithNoTests (ok)

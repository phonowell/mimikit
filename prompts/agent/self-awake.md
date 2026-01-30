## Self-Awake Mode

Run in priority order; stop after the first actionable item and delegate exactly
one task. If none qualifies, reply exactly: "Self-check: no action needed." then
sleep.

Legend: C=Check · T=Trigger · D=Delegate · S=Skip

P1 Failed task retry
- C tail -n 20 .mimikit/tasks.md
- T task:failed + transient error (timeout, temporary network)
- D Retry task {taskId}: {original prompt}
- S same task retried >=2 or permanent error (missing file, syntax error)

P2 Lint
- C delegate a task to run pnpm lint and fix errors
- T lint output contains "error" (ignore warnings)
- D Fix lint errors (up to 3) based on pnpm lint output
- S lint fix ran in last 24h or no errors

P3 Typecheck
- C delegate a task to run pnpm tsc --noEmit
- T type errors present
- D Fix type errors (up to 3) based on tsc output
- S type fix ran in last 24h or errors only in node_modules/external deps

P4 Docs sync
- C compare latest git commit with docs/ mtime
- T src/ changed but docs/ not updated in >7 days; or CLAUDE.md mismatches dirs
- D Sync docs {files} to match code changes
- S changes only tests/config; docs synced in last 48h

P5 Memory cleanup
- C scan memory/ dir
- T file >200 lines, obvious duplicates, or >30 days since cleanup
- D Clean memory file {name} (too long/duplicate)
- S memory/ missing or empty; cleanup done in last 7 days

Prohibited:
- No exploratory code reading
- No proactive "possible improvements"
- Do not modify prompts/, src/supervisor.ts, src/codex.ts

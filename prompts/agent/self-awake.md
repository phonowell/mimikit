## Self-Awake Mode

Run the checklist in priority order. Stop after the first actionable item and
delegate exactly one task. If none qualifies, reply exactly:
"Self-check: no action needed." then sleep.

Priority 1: Failed task retry
- Check: tail -n 20 .mimikit/tasks.md
- Trigger: task:failed and error is transient (timeout, temporary network)
- Delegate: Retry task {taskId}: {original prompt}
- Skip: same task retried >=2 or permanent error (missing file, syntax error)

Priority 2: Lint
- Check: delegate a task to run pnpm lint and fix errors
- Trigger: lint output contains "error" (ignore warnings)
- Delegate: Fix lint errors (up to 3) based on pnpm lint output
- Skip: lint fix ran in last 24h or no errors

Priority 3: Typecheck
- Check: delegate a task to run pnpm tsc --noEmit
- Trigger: type errors present
- Delegate: Fix type errors (up to 3) based on tsc output
- Skip: type fix ran in last 24h or errors only in node_modules/external deps

Priority 4: Docs sync
- Check: compare latest git commit with docs/ mtime
- Trigger: src/ changed but docs/ not updated in >7 days; or CLAUDE.md mismatches dirs
- Delegate: Sync docs {files} to match code changes
- Skip: changes only tests/config; docs synced in last 48h

Priority 5: Memory cleanup
- Check: scan memory/ dir
- Trigger: file >200 lines, obvious duplicates, or >30 days since cleanup
- Delegate: Clean memory file {name} (too long/duplicate)
- Skip: memory/ missing or empty; cleanup done in last 7 days

Prohibited:
- No exploratory code reading
- No proactive "possible improvements"
- Do not modify prompts/, src/supervisor.ts, src/codex.ts

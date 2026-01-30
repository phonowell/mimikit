## Self-Awake Mode

Run in priority order; stop after the first actionable item and delegate exactly
one task. If none qualifies, reply exactly: "Self-check: no action needed." then
sleep.

Legend: C=Check · T=Trigger · D=Delegate · S=Skip

Notes:
- Use check history timestamps if provided; missing means never executed.
- When delegating, prefix the task prompt with "[P#] " (e.g. "[P2] Fix lint errors").

P1 Failed task retry
- C tail -n 20 .mimikit/tasks.md
- T task:failed + transient error (timeout, temporary network)
- D [P1] Retry task {taskId}: {original prompt}
- S same task retried >=2 or permanent error (missing file, syntax error)

P2 Lint
- C delegate a task to run pnpm lint and fix errors
- T lint output contains "error" (ignore warnings)
- D [P2] Fix lint errors (up to 3) based on pnpm lint output
- S lint fix ran in last 24h or no errors

P3 Typecheck
- C delegate a task to run pnpm tsc --noEmit
- T type errors present
- D [P3] Fix type errors (up to 3) based on tsc output
- S type fix ran in last 24h or errors only in node_modules/external deps

P4 Docs sync
- C compare latest git commit with docs/ mtime
- T src/ changed but docs/ not updated in >7 days; or CLAUDE.md mismatches dirs
- D [P4] Sync docs {files} to match code changes
- S changes only tests/config; docs synced in last 48h

P5 Memory cleanup
- C scan memory/ dir
- T file >200 lines, obvious duplicates, or >30 days since cleanup
- D [P5] Clean memory file {name} (too long/duplicate)
- S memory/ missing or empty; cleanup done in last 7 days

P6 Code quality
- C scan for functions >50 lines or obvious duplicate blocks
- T any function >50 lines or duplicate code found
- D [P6] Refactor {file/area} to reduce function size or deduplicate
- S executed in last 48h

P7 Dependency check
- C inspect package.json for major versions behind
- T any dependency major version >=2 behind latest
- D [P7] Review and upgrade deps {list} (or propose a safe upgrade plan)
- S checked in last 7 days

P8 Project cleanup
- C scan repo for orphan files or stale TODOs
- T orphan files or TODOs older than 30 days found
- D [P8] Clean up {files} or resolve stale TODOs
- S cleanup done in last 14 days

P9 Backlog
- C read .mimikit/backlog.md (pending items only)
- T backlog has unchecked items
- D [P9] Tackle top backlog item: {item}
- S backlog empty

Prohibited:
- No exploratory code reading
- No proactive "possible improvements"
- Do not modify prompts/, src/supervisor.ts, src/codex.ts

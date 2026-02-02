# Task Plan: three-roles

## Goal
Refactor Mimikit to a three-role architecture (Teller + Thinker + Worker) with MIMIKIT command tags, JSONL state files, and new supervisor loops, matching the provided plan.

## Scope
- Remove tool system + legacy planner/agent pipeline.
- Add command parser/executor for MIMIKIT tags.
- Implement JSONL-based state files and new task queue format.
- Rebuild prompts and role runners.
- Refactor supervisor/HTTP/CLI/config to the new loops and config shape.

## Decisions (confirmed)
1) Teller input handling: in-memory buffer; write `user-inputs.jsonl` via `<MIMIKIT:record_input />` only.
2) JSONL processed flags: rewrite JSONL files to mark processed (no cursor file).
3) HTTP API: break compatibility and simplify as needed.

## Phases
1) **State + Types** — Done
   - Added JSONL helpers and new state paths.
   - Added new types: UserInput, TellerNotice, ThinkerState, Task/TaskResult.
   - Rebuilt storage for JSONL + tasks.

2) **Commands** — Done
   - Implemented `src/commands/parser.ts` + `src/commands/executor.ts`.

3) **Prompts + Runners** — Done
   - Rebuilt prompts under `prompts/agents/{teller,thinker,worker}/system.md`.
   - Rewrote `src/roles/prompt.ts` + `src/roles/runner.ts`.

4) **Supervisor Loops** — Done
   - Added `tellerLoop`, `thinkerLoop`, `workerLoop`.
   - Rebuilt `Supervisor` to start loops and manage runtime state.

5) **Remove Legacy System** — Done
   - Deleted `src/tools/`, old supervisor/dispatch/runner/history/recovery/results.
   - Removed inbox/teller-inbox/pending-question/migrations/queue/task-status.
   - Removed process lane queue and old llm schema/tool parsing.

6) **Config + API** — Done
   - Simplified `src/config.ts`.
   - Updated CLI + HTTP handler.
   - Updated web UI to new task/status semantics and teller role.

7) **Fixups + Validation** — Done
   - Updated task views and storage.
   - `pnpm exec tsc -p tsconfig.json` passes.

## Files (actual)
- New: `src/commands/parser.ts`, `src/commands/executor.ts`, `src/storage/jsonl.ts`, `src/storage/user-inputs.ts`, `src/storage/teller-notices.ts`, `src/storage/thinker-state.ts`, `src/storage/tasks.ts`, `src/storage/task-results.ts`, `src/shared/sleep.ts`, `src/supervisor/runtime.ts`, `src/supervisor/teller.ts`, `src/supervisor/thinker.ts`, `src/supervisor/worker.ts`.
- Updated: `src/roles/prompt.ts`, `src/roles/runner.ts`, `src/supervisor/supervisor.ts`, `src/supervisor/task-view.ts`, `src/config.ts`, `src/cli.ts`, `src/http/handler.ts`, `src/fs/paths.ts`, `src/fs/init.ts`, `src/tasks/pick.ts`, web UI message/task rendering.
- Deleted: `src/tools/`, old prompts, old supervisor/dispatch/runner/results/history/recovery, old storage/inbox/queue/task-status, old llm schema/tool parsing, process lane queue, run-log CLI.

## Risks / Notes
- JSONL rewrite cost grows with file size.
- Result files are removed after Thinker processes them.
- API and web UI are intentionally incompatible with previous versions.

## Status
- Completed.

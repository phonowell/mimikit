# Task Plan: design-docs

## Goal
- Revise docs/design to resolve inconsistencies and fill missing semantics (triggers vs runs, task_status, file_changed baseline, async ask_user), keep each file ≤200 lines.

## Scope
- Update: docs/design/README.md, docs/design/task-system.md, docs/design/tools.md, docs/design/supervisor.md, docs/design/memory.md.
- Add: mention of task_status index + atomic file write convention.

## Decisions
- Conditional/recurring/scheduled live in triggers; when fired they enqueue oneshot runs.
- Introduce task_status index for task_done/task_failed evaluation + result cleanup.
- ask_user is async (no synchronous answer return).

## Steps
1. Draft unified semantics + schemas (triggers/runs/status) and adjust lifecycle text. ✅
2. Update tools + supervisor + memory docs to align with new semantics. ✅
3. Compress task-system/tools to ≤200 lines and validate line counts. ✅

## Status
- Completed

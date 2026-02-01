# Task Plan: mimikit-moltbot-roadmap

## Goal
Deliver a phased roadmap to harden mimikit's runtime design using patterns verified in ../moltbot.

## Scope
- Design + runtime architecture (scheduler, storage, queues, observability, safety).
- No code changes in this task; output is a roadmap/plan only.

## Plan
- [x] Review mimikit design docs (docs/design/*) and list design gaps.
- [x] Inspect moltbot scheduler/state/queue implementation for transferable patterns.
- [x] Draft a phased roadmap with file-level targets and risk notes.
- [ ] Confirm priorities/timeline with the user.

## Roadmap (draft)
Phase 0 - Storage safety + schema evolution
- Add per-store lock + read-modify-write helper for .mimikit JSON files.
  Targets: src/storage/json-list.ts:1, src/storage/queue.ts:1, src/storage/triggers.ts:1, src/storage/task-status.ts:1, src/storage/history.ts:1, src/storage/inbox.ts:1, src/storage/teller-inbox.ts:1, src/storage/pending-question.ts:1, src/fs/atomic.ts:1 (extend), new src/storage/store-lock.ts:1.
- Add store schema version + migrations for task/trigger/result files.
  Targets: docs/design/task-data.md:1, docs/design/state-directory.md:1, src/types/*:1, new src/storage/migrations.ts:1.
- Add backup-on-write and recover-from-backup policy.
  Targets: src/fs/atomic.ts:1, docs/design/state-directory.md:1.

Phase 1 - Scheduler semantics + timer-based wakeups
- Persist trigger runtime state (nextRunAt, runningAt, lastStatus/lastError) and recompute on boot.
  Targets: docs/design/task-data.md:1, docs/design/task-conditions.md:1, src/scheduler/triggers.ts:1, src/supervisor/recovery.ts:1.
- Replace 1s tick scanning with next-wake timer and due set (min nextRunAt).
  Targets: src/supervisor/runner.ts:1, src/scheduler/triggers.ts:1.
- Add stuck-run clearing and one-shot disable/delete rules.
  Targets: src/scheduler/triggers.ts:1, docs/design/supervisor.md:1.

Phase 2 - Queue lanes + backpressure + fairness
- Introduce in-process command lanes (teller/planner/worker/internal) with max concurrency config.
  Targets: new src/process/command-queue.ts:1, src/supervisor/dispatch.ts:1, src/config.ts:1.
- Add queue depth warnings + starvation protection (aging or time-slice).
  Targets: src/supervisor/dispatch.ts:1, src/log/*:1, docs/design/supervisor.md:1.

Phase 3 - Observability + run history
- Add per-task/trigger run logs (JSONL) with pruning.
  Targets: new src/log/task-run-log.ts:1, src/supervisor/results.ts:1, docs/design/supervisor.md:1.
- Expose run logs/status via HTTP/CLI.
  Targets: src/http/handler.ts:1, src/cli.ts:1, docs/design/interfaces.md:1.

Phase 4 - Safety + access control
- Add auth to HTTP endpoints and audit logging for external inputs.
  Targets: src/http/handler.ts:1, docs/design/interfaces.md:1, docs/design/supervisor.md:1.
- Define task execution semantics (at-least-once vs at-most-once) + retry policy.
  Targets: docs/design/task-system.md:1, docs/design/supervisor.md:1, src/supervisor/results.ts:1.

Phase 5 - Memory lifecycle
- Add explicit memory retention/deletion policy and user controls.
  Targets: docs/design/memory.md:1, src/cli.ts:1, src/memory/*:1.

## Risks / Assumptions
- This plan assumes .mimikit remains the single source of truth (no DB).
- Scheduler changes may affect ordering; needs migration plan for existing triggers/tasks.
- Concurrency lanes will require careful interaction with existing process lifecycle.

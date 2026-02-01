# Task Plan: mimikit-runtime-hardening

## Goal
Implement the full hardening roadmap: storage safety, scheduler semantics, concurrency lanes/backpressure, run logs/observability, HTTP auth + execution semantics, and memory retention controls. Keep docs in sync with code.

## Scope
- Code changes in src/** and docs/design/**, docs/dev-conventions if needed.
- No external deps.

## Plan
- [x] Phase 0: storage locks + schema versioning + backup-on-write.
- [x] Phase 1: trigger runtime state + timer-based wakeups + stuck-run handling.
- [x] Phase 2: lane queues + fairness/backpressure + config wiring.
- [x] Phase 3: task/trigger run logs + HTTP/CLI access.
- [x] Phase 4: HTTP auth + execution semantics (retry policy) updates.
- [x] Phase 5: memory retention policy + CLI controls.
- [x] Update design docs to match behavior.
- [ ] Run review-code-changes skill.

## Progress Notes
- 2026-02-01: completed phases 0-5 and updated design docs; pending review-code-changes.

## Risks / Assumptions
- Assumes .mimikit remains file-based source of truth (no DB).
- Scheduler changes must preserve existing trigger/task files with migrations.

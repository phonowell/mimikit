# Self-Awake Task Expansion Plan

Status: completed
Progress: 3/3

## Goal
Expand self-awake checks, add backlog support, and track check history for skip rules.

## Scope
- Update self-awake checklist prompt with P6-P9 and delegation prefix
- Add backlog read/write helpers and initial backlog file
- Extend self-awake state with check history and prompt injection

## Non-goals
- Add tests (unless needed for debugging)
- Modify supervisor or codex runtime

## Steps
1) Update self-awake prompt checklist (P6-P9 + delegation prefix)
2) Add backlog module and seed .mimikit/backlog.md
3) Extend agent self-awake state/history + backlog/check history prompt context

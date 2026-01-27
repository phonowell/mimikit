# Notes: Minimal Codex Coordinator

## Sources
- `CLAUDE.md`
- `docs/minimal-implementation-plan.md`
- `docs/minimal-architecture.md`
- `docs/minimal-notes.md`
- `docs/codex-exec-reference.md`

## Key requirements
- Master runs 24x7; Worker runs single codex exec.
- tasks.md is recovery source of truth.
- Per-session serial queue + transcript lock.
- Output Policy appended to worker prompt.
- tsx execution, no build step.

## Assumptions
- Node.js 22+ with tsx available.
- Minimal HTTP server (no framework).

## Decisions
- Default `stateDir`: `<workspace>/.mimikit`.
- `resume=always` without sessionId: hard-fail with clear error.

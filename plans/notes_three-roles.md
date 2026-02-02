# Notes: three-roles

## User plan highlights
- Roles: Teller (local), Thinker (Codex session), Worker (Codex tasks).
- State files under `.mimikit/`:
  - `user-inputs.jsonl`, `teller-notices.jsonl`, `thinker-state.json`.
  - `agent-queue/`, `agent-results/`, `history.jsonl`.
- Command tags `<MIMIKIT:...>` parsed from LLM output.
- Teller: chat + record input + read notices.
- Thinker: decide tasks, manage queue, notify teller, update state.
- Worker: execute tasks; scheduling based on priority, dependencies, and schedule.

## Open questions / assumptions
- Teller input queue: likely in-memory buffer filled by HTTP `addUserInput`.
- JSONL processed flags will require rewrite or cursor.
- Keep HTTP API compatibility unless asked otherwise.

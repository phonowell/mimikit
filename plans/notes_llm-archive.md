# Notes: llm-archive

- User request (2026-02-03): every LLM interaction must be archived in `.mimikit` with full input + output.
- Existing persistence: `history.jsonl` stores user/manager text; `log.jsonl` stores events.
- Decision: write per-day JSONL files under `.mimikit/llm/` (lexicographic date order).

# Notes: memory-integration

Assumptions
- Prefer zero extra model calls for auto memory writes (token saving).
- CN environment: avoid dependencies that require blocked or slow external services.
- Keep defaults minimal; no complex config surface for v1.
- Keep chat_history after handoff; need watermark to prevent re-trigger.
 - Rollup summaries may require model calls unless we accept heuristic summaries.

Open Questions
- Do we keep raw session files searchable after daily rollup (5-30d), or only summaries?
- Summary size target (lines/chars) and output format?
- Rollup trigger: on wake when idle, or fixed time window?
## Decisions (from chat)
- Query expansion: rule-based.
- Auto handoff: 6h idle or 100 chat messages.
- /new semantics: reset sessionId, keep chat_history.
- Retention tiers: 0-5d raw session files, 5-30d daily summaries.

Constraints
- Do not add tests unless needed for debugging.
- Keep memory hits capped to preserve prompt tokens.

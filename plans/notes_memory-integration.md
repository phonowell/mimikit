# Notes: memory-integration

Assumptions
- Prefer zero extra model calls for auto memory writes (token saving).
- CN environment: avoid dependencies that require blocked or slow external services.
- Keep defaults minimal; no complex config surface for v1.
- Keep chat_history after handoff; need watermark to prevent re-trigger.
- Rollup summaries use model calls (no explicit length limits).
 - MEMORY.md stays short and structured to avoid recall noise.

Open Questions
- None (decisions set in plan).
## Decisions (from chat)
- Query expansion: rule-based.
- Auto handoff: 6h idle or 100 chat messages.
- /new semantics: reset sessionId, keep chat_history.
- Retention tiers: 0-5d raw session files, 5-90d daily summaries, >90d monthly summaries.
- Raw files beyond 5d not searchable by default.
- Rollup runs only on self-awake.
- Search scope includes memory/summary/.
- BM25 library: wink-bm25-text-search.
- MEMORY.md usage: curated long-term facts only; keep short, structured entries.

Constraints
- Do not add tests unless needed for debugging.
- Keep memory hits capped to preserve prompt tokens.

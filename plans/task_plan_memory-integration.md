# Task Plan: memory-integration

Goal
- Add a two-tier memory system (MEMORY.md + memory/YYYY-MM-DD.md).
- Add keyword expansion + BM25 retrieval with rg fallback.
- Add memory CLI tooling (status/index/search).
- Add automated memory writes (/new hook + pre-compaction-like flush).
- Add tiered retention: 0-5d raw session files, 5-90d daily summaries, >90d monthly summaries.

Status
- Current: in_progress
- Progress: 0/8

Files
- src/memory.ts:18-132
- src/agent.ts:37-145, 363-452
- prompts/agent/memory.md:1-4
- docs/minimal-architecture.md:9-49
- src/supervisor.ts:92-207, 236-251
- src/protocol.ts:89-160, 299-340
- src/cli.ts:7-61
- bin/mimikit
- package.json
- NEW: src/memory/index.ts
- NEW: src/memory/bm25.ts
- NEW: src/memory/query-expand.ts
- NEW: src/memory/write.ts
- NEW: src/memory/session-hook.ts
- NEW: src/memory/flush.ts
- NEW: src/memory/rollup.ts
- NEW: src/memory/cli.ts
- NEW: .mimikit/memory_flush.json
- NEW: .mimikit/memory_rollup.json

Phases
1) Align memory layout + prompts
   - Update default memory paths to include MEMORY.md + memory/ + memory/summary/ + docs/.
   - Update memory prompt text to mention MEMORY.md and daily files.
   - Update docs/minimal-architecture.md Memory description.
2) Add memory write helpers
   - Implement daily memory append + long-term memory append helpers.
   - Standardize file header format (date, session id, source) with zero model calls.
3) /new session memory hook
   - Auto session handoff: trigger on 6h idle or 100 chat messages (mixed).
   - Read last N chat messages, generate deterministic slug, write memory/YYYY-MM-DD-slug.md.
   - Reset agent sessionId; keep chat_history (decision gate: verify risk).
   - Persist handoff watermark (lastHandoffAt + lastChatCount) in .mimikit/memory_flush.json to avoid repeat triggers.
4) Daily rollup (5d~90d)
   - For days older than 5d and newer than 90d, summarize that day's session files.
   - Store summary in memory/summary/YYYY-MM-DD.md with source file list.
   - Track rollup watermark per day in .mimikit/memory_rollup.json.
   - Raw files remain but are excluded from search by default.
5) Monthly rollup (>90d)
   - Summarize per-month from daily summaries into memory/summary/YYYY-MM.md.
   - Track monthly rollup watermark in .mimikit/memory_rollup.json.
6) Pre-compaction-like memory flush
   - Add heuristic trigger (chat_history.json size or message count) before runAgent.
   - Persist lastFlushAt + lastChatSize in .mimikit/memory_flush.json to avoid repeats.
   - Flush writes to daily memory file only, no extra model call.
7) Keyword expansion + BM25
   - Build memory indexer: chunk markdown, store metadata, update on change.
   - Implement BM25 scoring via third-party library (no custom impl).
   - Add rule-based query expansion, cap terms to preserve token budget.
   - Wire search to prefer BM25, fallback to rg when index unavailable.
8) Memory CLI
   - Add memory CLI entrypoint with status/index/search.
   - Expose index stats (files, chunks, last sync) and simple search output.
   - Add bin/script wiring for `mimikit memory ...` (or separate `mimikit-memory`).

Decisions
- BM25 library: wink-bm25-text-search.
- BM25 backend: third-party library (no custom impl, no sqlite FTS5).
- CJK tokenization strategy (rule-based tokenization vs simple bigrams).
- Query expansion strategy: rule-based.
- Auto handoff: 6h idle or 100 chat messages.
- /new semantics: reset sessionId, keep chat_history.
- Handoff watermark persisted to avoid repeat triggers.
- Search scope fixed: MEMORY.md + memory/ + docs/.
- Search scope includes summaries: memory/summary/.
- Retention tiers: 0-5d raw session files, 5-90d daily summaries, >90d monthly summaries.
- Rollup runs only on self-awake.
- Raw files beyond 5d are excluded from search by default.

Risks
- Index freshness and storage size need guardrails to avoid runaway IO.
- Auto flush could create noisy memory without clear de-duplication.
- Query expansion can increase noise and reduce precision if not capped.
- Rollups use model calls (token cost); no length limits may increase costs.
- Keeping chat_history without pruning can grow files indefinitely.

Errors
- None

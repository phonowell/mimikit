# Task Plan: memory-integration

Goal
- Add a two-tier memory system (MEMORY.md + memory/YYYY-MM-DD.md).
- Add keyword expansion + BM25 retrieval with rg fallback.
- Add memory CLI tooling (status/index/search).
- Add automated memory writes (/new hook + pre-compaction-like flush).
- Add tiered retention: 0-5d raw session files, 5-90d daily summaries, >90d monthly summaries.

Status
- Current: completed
- Progress: 8/8

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
   - Update default memory paths to include MEMORY.md + memory/ + memory/summary/ + docs. (Done)
   - Update memory prompt text to mention MEMORY.md and daily files. (Done)
   - Update docs/minimal-architecture.md Memory description. (Done)
2) Add memory write helpers
   - Implement daily memory append + long-term memory append helpers. (Done)
   - Standardize file header format (date, session id, source) with zero model calls. (Done)
3) /new session memory hook
   - Auto session handoff: trigger on 6h idle or 100 chat messages (mixed). (Done)
   - Read last N chat messages, generate deterministic slug, write memory/YYYY-MM-DD-slug.md. (Done)
   - Reset agent sessionId; keep chat_history (decision gate: verify risk). (Done)
   - Persist handoff watermark (lastHandoffAt + lastChatCount) in .mimikit/memory_flush.json to avoid repeat triggers. (Done)
   - Wire into supervisor before runAgent. (Done)
4) Daily rollup (5d~90d)
   - For days older than 5d and newer than 90d, summarize that day's session files. (Done)
   - Store summary in memory/summary/YYYY-MM-DD.md with source file list. (Done)
   - Track rollup watermark per day in .mimikit/memory_rollup.json. (Done)
   - Raw files remain but are excluded from search by default. (Done)
5) Monthly rollup (>90d)
   - Summarize per-month from daily summaries into memory/summary/YYYY-MM.md. (Done)
   - Track monthly rollup watermark in .mimikit/memory_rollup.json. (Done)
6) Pre-compaction-like memory flush
   - Add heuristic trigger (chat_history.json size or message count) before runAgent. (Done)
   - Persist lastFlushAt + lastChatSize in .mimikit/memory_flush.json to avoid repeats. (Done)
   - Flush writes to daily memory file only, no extra model call. (Done)
7) Keyword expansion + BM25
   - Build memory indexer: chunk markdown, store metadata, update on change. (Done)
   - Implement BM25 scoring via third-party library (no custom impl). (Done)
   - Add rule-based query expansion, cap terms to preserve token budget. (Done)
   - Wire search to prefer BM25, fallback to rg when index unavailable. (Done)
8) Memory CLI
   - Add memory CLI entrypoint with status/index/search. (Done)
   - Expose index stats (files, chunks, last sync) and simple search output. (Done)
   - Add bin/script wiring for `mimikit memory ...` (or separate `mimikit-memory`). (Done)

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
- MEMORY.md usage: curated long-term facts only; keep short, structured entries.

Risks
- Index freshness and storage size need guardrails to avoid runaway IO.
- Auto flush could create noisy memory without clear de-duplication.
- Query expansion can increase noise and reduce precision if not capped.
- Rollups use model calls (token cost); no length limits may increase costs.
- Keeping chat_history without pruning can grow files indefinitely.
- MEMORY.md growth can degrade recall precision and indexing speed.

Errors
- None

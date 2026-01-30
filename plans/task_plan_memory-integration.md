# Task Plan: memory-integration

Goal
- Add a two-tier memory system (MEMORY.md + memory/YYYY-MM-DD.md).
- Add keyword expansion + BM25 retrieval with rg fallback.
- Add memory CLI tooling (status/index/search).
- Add automated memory writes (/new hook + pre-compaction-like flush).
- Add tiered retention: 0-5d raw session files, 5-30d daily summaries.

Status
- Current: in_progress
- Progress: 0/7

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
   - Update default memory paths to include MEMORY.md + memory/ + docs/.
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
4) Daily rollup (5d~30d)
   - For days older than 5d and newer than 30d, summarize that day's session files.
   - Store summary in memory/summary/YYYY-MM-DD.md with source file list.
   - Track rollup watermark per day in .mimikit/memory_rollup.json.
   - Decide whether raw files stay searchable after rollup.
5) Pre-compaction-like memory flush
   - Add heuristic trigger (chat_history.json size or message count) before runAgent.
   - Persist lastFlushAt + lastChatSize in .mimikit/memory_flush.json to avoid repeats.
   - Flush writes to daily memory file only, no extra model call.
6) Keyword expansion + BM25
   - Build memory indexer: chunk markdown, store metadata, update on change.
   - Implement BM25 scoring (JS BM25 or sqlite FTS5).
   - Add rule-based query expansion, cap terms to preserve token budget.
   - Wire search to prefer BM25, fallback to rg when index unavailable.
7) Memory CLI
   - Add memory CLI entrypoint with status/index/search.
   - Expose index stats (files, chunks, last sync) and simple search output.
   - Add bin/script wiring for `mimikit memory ...` (or separate `mimikit-memory`).

Decisions
- BM25 backend fixed: pure JS (no sqlite FTS5).
- CJK tokenization strategy (rule-based tokenization vs simple bigrams).
- Query expansion strategy: rule-based.
- Auto handoff: 6h idle or 100 chat messages.
- /new semantics: reset sessionId, keep chat_history.
- Handoff watermark persisted to avoid repeat triggers.
- Search scope fixed: MEMORY.md + memory/ + docs/.
- Retention tiers: 0-5d raw session files, 5-30d daily summaries.

Risks
- Index freshness and storage size need guardrails to avoid runaway IO.
- Auto flush could create noisy memory without clear de-duplication.
- Query expansion can increase noise and reduce precision if not capped.
- Daily rollup uses model calls (token cost) or heuristic summaries (lower quality).
- Keeping chat_history without pruning can grow files indefinitely.

Errors
- None

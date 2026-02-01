# Notes: System Optimization

- Created 2026-02-01.
- No user questions allowed; proceed with assumptions and document decisions.

## Candidate optimization points (mimikit)
- scheduler/triggers: processTriggers writes trigger files every tick even when state unchanged -> high disk I/O.
- storage/queue: listItems reads queue files sequentially -> slow when many tasks/results.
- memory/search: builds BM25 index by reading every memory file on each query -> heavy I/O (left for later).

## Moltbot references
- Concurrency-limited task runner used for indexing: src/memory/manager.ts runWithConcurrency + src/media-understanding/concurrency.ts.
- Write only on change patterns: pairing store writes only when pruned/changed (src/pairing/pairing-store.ts).

## Implemented
- listItems now reads queue entries with concurrency limit (order preserved).
- processTriggers now writes triggers only when changes occur.

## Validation
- pnpm -s test (pass)

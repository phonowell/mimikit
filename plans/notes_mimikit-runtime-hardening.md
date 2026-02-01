# Notes: mimikit-runtime-hardening

- Date: 2026-02-01
- Request: implement full roadmap without further questions; keep docs and code in sync.

## Decisions
- Introduce per-store lock files for JSON read-modify-write operations.
- Add schemaVersion to task/trigger/result JSON with migration-on-read.
- Replace fixed-interval tick scheduling with next-wake timer (still runs a tick when needed).
- Add in-process command lanes with configurable concurrency.
- Add task/trigger run logs (JSONL) with pruning.
- Add optional HTTP auth via header token (config/env).
- Add memory retention policy with CLI controls (prune/delete).

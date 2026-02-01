# Notes: mimikit-moltbot-roadmap

- Date: 2026-02-01
- Request: explore ../moltbot and propose a mimikit improvement roadmap.

## Moltbot findings (verified)
- Cron scheduler persists jobs in a JSON store with versioning + atomic write + backup: src/cron/store.ts, src/cron/types.ts.
- Cron service serializes operations per store path via an in-process lock chain: src/cron/service/locked.ts.
- Timer-based scheduling uses nextRunAtMs to avoid polling: src/cron/service/timer.ts.
- Job state tracks runningAtMs/nextRunAtMs/lastStatus/lastError/lastDurationMs and clears stuck runs after 2h: src/cron/types.ts, src/cron/service/jobs.ts.
- Per-job run logs in JSONL with pruning: src/cron/run-log.ts.
- Command lanes with configurable max concurrency: src/process/command-queue.ts, src/gateway/server-lanes.ts.
- Session store uses lock file + read-modify-write + cache TTL + atomic writes: src/config/sessions/store.ts.
- Cron jobs can run in main vs isolated sessions and post summaries back to main: docs/automation/cron-jobs.md, src/cron/service/timer.ts, src/cron/isolated-agent/run.ts.

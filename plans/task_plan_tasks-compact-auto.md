# Task Plan: tasks-compact-auto

## Goal
- Add automatic task ledger compaction based on thresholds/intervals.

## Scope
- Extend config/env to enable auto compaction.
- Add runtime auto compaction hook with safety checks.
- Add minimal tests for threshold-triggered compaction.

## Decisions
- Default on with thresholds and interval; disable when interval <= 0 or both thresholds <= 0.
- Defaults: bytes=20_000, records=1_000, intervalMs=600_000.
- Skip compaction when active tasks exist.

## Steps
1. Update config parsing to include ledger compaction options.
2. Add auto-compaction logic and wire into Master lifecycle.
3. Add tests covering threshold-based compaction.

## Status
- current: 3/3
- last_updated: 2026-01-28

## Progress Log
- 2026-01-28: Plan created.
- 2026-01-28: Step 1 complete (config fields + defaults).
- 2026-01-28: Step 2 complete (auto compaction logic + Master hook).
- 2026-01-28: Step 3 complete (threshold compaction tests).

# Task Plan: tasks-compact

## Goal
- Add task ledger compaction to keep only the latest record per task.

## Scope
- Implement ledger compaction utility and export it.
- Add CLI command to compact tasks.md safely.
- Add tests to validate compaction output.

## Steps
1. Add ledger compaction helper and wire it into runtime exports.
2. Add CLI command with active-task guard and output stats.
3. Add minimal tests for compaction behavior.

## Status
- current: 3/3
- last_updated: 2026-01-28

## Progress Log
- 2026-01-28: Plan created and completed.

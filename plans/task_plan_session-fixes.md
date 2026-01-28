# Task Plan: session-fixes

## Goal
- Avoid transcript path collisions for session keys.
- Refresh session updatedAt on transcript writes/failures.
- Add minimal tests for both fixes.

## Scope
- SessionStore transcript naming.
- Task loop and runner updatedAt touches.
- Tests in session-store and task-loop.

## Steps
1. Update SessionStore transcript naming to avoid sanitize collisions.
2. Touch session updatedAt after transcript writes and failure paths.
3. Add tests for transcript path uniqueness and updatedAt refresh.

## Status
- current: 3/3
- last_updated: 2026-01-27

## Progress Log
- 2026-01-27: Plan created after implementation; recorded completion.

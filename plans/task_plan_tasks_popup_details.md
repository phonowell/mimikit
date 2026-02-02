# Task Plan: Tasks popup details

## Goal
Show role, completion time, duration, and token usage in the tasks modal, with backend persistence for completed tasks.

## Steps
1. Extend task/result/status types and migrations to carry role, duration, and token usage (plus planner summary where needed).
2. Populate the new fields in supervisor runners/processors and ensure task view builds include them.
3. Update the web UI rendering to display role, completion time, duration, and in/out tokens.

## Status
- [x] Step 1
- [x] Step 2
- [x] Step 3

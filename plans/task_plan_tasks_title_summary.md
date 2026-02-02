# Task Plan: Tasks title summary stability

## Goal
Ensure tasks popup title always uses the planner-decided summary set at delegation time and does not change after completion.

## Steps
1. Add shared summary helper and update task-related types to carry a `summary` field through tasks, worker results, and task status.
2. Populate summary when creating tasks/results/status (planner delegation, delegate tool, triggers, worker snapshots, retries, recovery).
3. Update tasks popup view logic to prefer summary for title across queued/running/completed tasks.

## Status
- [x] Step 1
- [x] Step 2
- [x] Step 3

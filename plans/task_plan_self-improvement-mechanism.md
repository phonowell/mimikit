# Self-Improvement Mechanism - Implementation Plan

Status: completed
Progress: 5/5

## Goal
Implement the self-awake improvement workflow with:
- Structured self-check list and strict skip rules
- Single delegation cap during self-awake
- Git stash safety for rollback on failure
- Audit log for every action
- Post-success review + branch + MR flow

## Scope
- Prompt updates for self-awake behavior
- Agent/runtime orchestration for stash, delegation limit, review/commit
- Task metadata/audit logging across agent + task

## Non-goals
- Modifying supervisor or codex runtime
- Adding tests (unless required for debugging)
- Any exploratory improvements outside the defined checklist

## Decisions
1) Tag self-awake tasks: Option A (extend PendingTask/TaskResult with origin + selfAwakeRunId)
2) Self-awake state: Option A (new .mimikit/self_awake.json)
3) Review + MR: Option A (local branch + commit only; audit logs MR pending)
4) Review execution: Option A (dedicated codex exec review prompt)

## Steps (done)
1) Update self-awake prompt checklist and prohibitions
   - File: prompts/agent/self-awake.md:1
   - Add structured checklist (priority 1-5), skip rules, and exact no-action output.

2) Add audit module + JSONL writer
   - File: src/audit.ts (new)
   - Provide appendAudit({timestamp, taskId, trigger, action, diffSummary}) and helper to collect git diff summary.

3) Extend task metadata to track origin/self-awake
   - File: src/protocol.ts:9
   - File: src/task.ts:12
   - Add optional fields to PendingTask/TaskResult and propagate them in writeTaskResult.

4) Implement self-awake stash + delegation limit + state tracking
   - File: src/agent.ts:37
   - File: src/agent.ts:98
   - File: src/agent.ts:558
   - On self-awake start: git stash push -m "self-awake-{timestamp}" and record stash ref + runId.
   - When delegating during self-awake: cap to 1 and attach metadata.

5) Handle task completion: review + commit or rollback
   - File: src/agent.ts:118
   - Detect self-awake task results. On failure: git stash pop and audit.
   - On success: run review step; if pass create branch self-improve/{timestamp}, commit, and MR (per decision).

## Files
- prompts/agent/self-awake.md
- src/agent.ts
- src/task.ts
- src/protocol.ts
- src/audit.ts (new)
- (optional) src/self_awake_state.ts or .mimikit/self_awake.json

## Risks / Open Issues
- MR creation may be blocked by network; need fallback.
- git stash pop may conflict; needs error handling + audit.
- Metadata schema changes should remain backward-compatible for existing JSON files.

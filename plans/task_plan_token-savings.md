# Task Plan: token-savings

Goal
- Reduce prompt tokens per user suggestions without changing behavior.

Status
- Current: completed
- Progress: 5/5

Files
- prompts/agent/self-awake.md
- prompts/agent/core.md
- prompts/agent/soul.md
- prompts/agent/state-dir.md
- prompts/agent/task-delegation.md
- src/agent.ts
- src/memory.ts
- src/prompt.ts

Phases
1) Compress self-awake + delegation/state prompts
   - Done
   - refs: prompts/agent/self-awake.md:1, prompts/agent/state-dir.md:1,
     prompts/agent/task-delegation.md:1
2) Deduplicate core vs soul prompt content
   - Done
   - refs: prompts/agent/core.md:1, prompts/agent/soul.md:1
3) Tighten prompt assembly limits + history/task labels
   - Done
   - refs: src/agent.ts:239, src/agent.ts:556, src/agent.ts:586
4) Simplify review prompt + decision parsing
   - Done
   - refs: src/agent.ts:838
5) Shorten memory/task headers
   - Done
   - refs: src/memory.ts:196, src/prompt.ts:61

Decisions
- User change list treated as confirmed; no extra prompts.
- Review parser accepts PASS/FAIL plus legacy REVIEW: PASS/FAIL.

Risks
- Shorter history/task snippets may omit edge-case context.

Errors
- None

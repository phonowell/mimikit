# Task Plan: prompt-separation

Goal
- Move agent/task prompts into markdown files and load them from code.
- Introduce a dedicated SOUL.md for the main agent.

Status
- Current: completed
- Progress: 4/4

Files
- src/prompt.ts
- src/agent.ts
- src/task.ts
- docs/minimal-architecture.md
- prompts/agent/core.md
- prompts/agent/soul.md
- prompts/agent/task-delegation.md
- prompts/agent/memory.md
- prompts/agent/self-awake.md
- prompts/agent/state-dir.md
- prompts/task/core.md

Phases
1) Create prompts directory and templates (agent core, soul, task)
   - Done
2) Add prompt loader + template rendering in src/prompt.ts
   - Done
3) Wire agent/task to use markdown prompts
   - Done
4) Update docs to point to prompts directory
   - Done

Decisions
- Prompt templates live under prompts/ and are loaded via src/prompt.ts.
- Template placeholders use {{STATE_DIR}} for runtime injection.

Risks
- Missing prompt files will throw at startup; keep prompts/ in repo.

Errors
- None

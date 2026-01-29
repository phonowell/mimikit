# Task Plan: token-optimization

Goal
- Reduce prompt token usage while preserving relevance and task success.

Status
- Current: completed
- Progress: 6/6

Files
- src/agent.ts
- src/prompt.ts
- src/memory.ts
- src/protocol.ts
- src/supervisor.ts

Phases
1) Review current prompt assembly and history/memory flow
   - Done
   - refs: src/agent.ts:44-330, src/prompt.ts:3-83, src/memory.ts:20-115,
     src/protocol.ts:64-86, src/supervisor.ts:233-262
2) Improve keyword extraction (stopword filter + weighting)
   - Done
   - refs: src/agent.ts:145-262
3) Pre-filter chat history and tighten inclusion rules
   - Done
   - refs: src/agent.ts:50-214, src/protocol.ts:356-379
4) Make system prompt sections dynamic across resume vs first awake
   - Done
   - refs: src/agent.ts:212-330, src/prompt.ts:19-60
5) Tune memory hit trimming and task result truncation alignment
   - Done
   - refs: src/memory.ts:26-123, src/agent.ts:133-160, src/protocol.ts:64-86
6) Prevent duplicate user input across sections and verify output shape
   - Done
   - refs: src/agent.ts:182-276, src/supervisor.ts:233-262

Decisions
- Stopwords: small Latin list only; CJK filtered by short + low frequency.
- Weighting: frequency + length + underscore heuristic.
- Memory maxChars: 1200 static.
- Task results: reduce to 400 chars, MAX_TASK_RESULTS=2, history field=1200.
- Chat history: MAX_HISTORY_MESSAGES=4, fallback=2, MAX_HISTORY_CHARS=300.

Risks
- Over-filtering keywords could reduce memory recall quality.
- Shortening prompts may drop context needed for safe task completion.

Errors
- None

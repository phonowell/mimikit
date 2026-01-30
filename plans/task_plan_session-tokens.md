# Task Plan: session-tokens

Goal
- Show token usage per agent session and persist it in chat history.

Status
- Current: completed
- Progress: 4/4

Files
- src/codex.ts
- src/agent.ts
- src/protocol.ts
- src/webui/messages.js
- src/task.ts
- src/supervisor.ts
- src/webui/tasks.js

Phases
1) Extract token usage from codex JSONL and surface it in exec results
   - Done
   - refs: src/codex.ts
2) Persist usage on agent messages in protocol
   - Done
   - refs: src/agent.ts, src/protocol.ts
3) Render usage in WebUI message meta
   - Done
   - refs: src/webui/messages.js
4) Write task usage to task results/logs and task list
   - Done
   - refs: src/task.ts, src/supervisor.ts, src/webui/tasks.js

Risks
- Codex JSONL may omit usage fields; UI should gracefully hide usage when absent.

Errors
- None

# Task Plan: token-input-cleanup

Goal
- Clean user input noise before prompt build and reduce memory hits default.

Status
- Current: completed
- Progress: 3/3

Files
- src/agent.ts

Phases
1) Review current input flow and memory hit defaults
   - Done
   - refs: src/agent.ts:43-210
2) Add input noise cleanup and wire into prompt assembly
   - Done
   - refs: src/agent.ts:250-520
3) Adjust memory hit default and remove unused constants
   - Done
   - refs: src/agent.ts:70-120, src/agent.ts:230-260

Decisions
- None yet

Risks
- Over-cleaning might remove meaningful content if patterns are too broad.

Errors
- None

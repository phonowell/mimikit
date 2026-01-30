# Mimikit Dev Conventions

## Scope
- For agents developing/modifying project code.
- Runtime system instructions: CLAUDE.md.

## Key Rules
- Plan mgmt: >=3 steps -> /plans/task_plan_{suffix}.md and keep updated.
- Tests: do not add tests unless debugging; then add minimal tests only.
- Meta: trim redundancy; trust code on conflicts.
- Objectivity: no subjective judgments; do not shift stance with user emotion; no fabrication; surface uncertainty immediately.
- Types: >=5 non-null assertions => refactor type architecture (no eslint-disable bulk suppression).
- Environment: mainland China; avoid blocked/slow services.
- Skill use: if request matches a skill, call it; wait for completion before next steps.

## Paths
- Entry: src/cli.ts
- Core: src/supervisor.ts, src/agent.ts, src/task.ts
- Base: src/codex.ts, src/protocol.ts, src/memory.ts, src/prompt.ts
- Service: src/http.ts, src/webui/*

## Commands
- tsx src/cli.ts
- tsx src/cli.ts --port 8787

## Docs
- docs/minimal-architecture.md
- docs/agent-runtime.md
- docs/codex-exec-reference.md

## Style
- ESM + strict types; avoid any.
- Keep files small and clear; add brief comments only when needed.

## Output Format
- No preambles; status uses ✓/✗/→; zero output between tools; batch edits once.
- Data first; direct conclusions; no summary repetition; progress {current}/{total}; questions are direct.
- Error format `✗ {location}:{type}`; code blocks contain no comments; if >=2 items, use a list.
- Path shorthand: `.` project root, `~` home.

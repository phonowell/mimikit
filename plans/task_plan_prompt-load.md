# Task Plan: prompt-load

## Goal
- Replace hardcoded prompt injection strings with runtime loading of Markdown files from `prompts/` without caching.

## Plan
1. Locate current prompt injection code paths and hardcoded strings.
2. Identify target markdown files and loading strategy (paths, encoding, ESM usage).
3. Implement uncached markdown file reads from `prompts/` and wire into prompt injection flow.
4. Validate behavior and update any docs/tests if needed.

## Decisions
- Pending

## Progress
- Completed: located prompt injection hardcoding in `src/roles/prompt.ts`.
- Completed: added markdown-driven injection templates and loaders.
- Completed: wired manager/worker prompt assembly to render markdown templates.
- Validation: `pnpm exec eslint "src/**/*.ts"`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm test`.

## Risks / Questions
- Unknown prompt injection entrypoints and call frequency; reading from disk each time may impact perf.

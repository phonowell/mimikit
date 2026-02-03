# Task Plan: llm-archive

## Goal
- Persist every LLM interaction (full input + full output) under `.mimikit/`.

## Plan
1. Locate existing history/logging and prompt assembly for manager/worker.
2. Decide storage format/path for LLM transcripts in `.mimikit/`.
3. Implement transcript writing for manager + worker runs, including error paths.
4. Update docs/state directory notes and run checks.

## Decisions
- Transcript stored as per-call `.txt` in `.mimikit/llm/YYYY-MM-DD/` with timestamped filenames.

## Progress
- Completed: located manager/worker prompt assembly and history/log storage.
- Completed: chose date-based archive path and schema.
- Completed: switched archive format to per-call `.txt` with date directories.
- Validation: `pnpm exec eslint "src/**/*.ts"`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm test`.

## Risks / Questions
- Prompt size may bloat logs; need file separation or pruning policy.

name: smoke-live-workflow
description: API-only live smoke with LLM validation and metrics
# Smoke Live Workflow (API-only)
## When to use
- Quick smoke (<=15 min) with real model calls, no WebUI.

## Preconditions
- Export `MIMIKIT_API_KEY` (API auth for runtime).
- If `--llm-verify` is used: ensure model credentials for Codex SDK are set (e.g. `OPENAI_API_KEY`).

## Commands
- Full smoke + LLM verify:
  - `pnpm smoke:live --cases full --llm-verify`
- Split runs:
  - `pnpm smoke:live --cases C1,C2,C3 --llm-verify`
  - `pnpm smoke:live --cases C4 --llm-verify`
- Env alternatives:
  - `set MIMIKIT_SMOKE_CASES=basic` / `full` / `C1,C4`
  - `set MIMIKIT_SMOKE_LLM_VERIFY=1`
  - `set MIMIKIT_SMOKE_LLM_VERIFY_MODEL=<model>`

## Outputs
- Report JSON: `reports/smoke-live-<timestamp>.json`
- Metrics:
  - teller tokens: `cases[].usage` and `totals.usage`
  - LLM validation tokens: `cases[].llmValidation.usage`

## Notes
- Uses a fixed state dir `.mimikit-smoke` and clears it before each run.
- C4 enforces delegation and validates response against `src/scheduler/triggers.ts`.

name: smoke-live-workflow
description: API-only live smoke with LLM scoring, segmented runs, and metrics
# Smoke Live Workflow (API-only)
## When to use
- Quick smoke (<=15 min) with real model calls, no WebUI.

## Preconditions
- Export `MIMIKIT_API_KEY` (API auth for runtime).
- For LLM scoring (`--llm-verify` or `--phase llm`): ensure Codex SDK credentials are set (e.g. `OPENAI_API_KEY`).

## Commands
- Full smoke + LLM scoring:
  - `pnpm smoke:live --cases full --llm-verify`
- Segmented (fail-fast) to stop on the first failing case:
  - `pnpm smoke:live --segments "C1,C2|C3|C4" --llm-verify --fail-fast`
- Code-first then LLM-only phase:
  - `pnpm smoke:live --segments "C1,C2,C3" --phase code --fail-fast`
  - `pnpm smoke:live --segments "C4" --phase llm --fail-fast`
- Rerun remaining segments after a failure:
  - `pnpm smoke:live --segments "C3|C4" --llm-verify --fail-fast`

## Options / Env
- `--segments` / `MIMIKIT_SMOKE_SEGMENTS`: segment list `"name:C1,C2|C3|C4"` (name optional). Overrides `--cases`.
- `--cases` / `MIMIKIT_SMOKE_CASES`: `basic` / `full` / `C1,C4`.
- `--phase` / `MIMIKIT_SMOKE_PHASE`: `all` (default), `code` (deterministic only), `llm` (force LLM scoring).
- `--fail-fast` / `MIMIKIT_SMOKE_FAIL_FAST=1`: stop on first failed case.
- `--llm-verify` / `MIMIKIT_SMOKE_LLM_VERIFY=1`: enable LLM scoring.
- `--llm-verify-model` / `MIMIKIT_SMOKE_LLM_VERIFY_MODEL=<model>`.
- `--state-dir` to isolate runs; default `.mimikit-smoke` is cleared each run.

## Outputs
- Report JSON: `reports/smoke-live-<timestamp>.json`
- Metrics:
  - teller tokens: `cases[].usage` and `totals.usage`
  - LLM scoring: `cases[].llmValidation` + `cases[].qualityScore`

## Notes
- C4 enforces delegation and validates response against `src/scheduler/triggers.ts`.

## Related
- `workflows/debug-automation.md`

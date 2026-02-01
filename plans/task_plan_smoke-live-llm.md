# Task Plan: smoke-live-llm

## Goal
- Run live smoke with LLM validation enabled (API-only), capture time/tokens metrics, and answer compliance questions about C1-C3 and segmented validation.

## Steps
1) Review current smoke runner and related changes for LLM validation and case filtering.
2) Execute smoke runs with --llm-verify for C1-C3 and C4 (segmented), capture report paths.
3) Summarize results and answer user questions (C1-C3 time/tokens compliance, segmented validation strategy, LLM validation usage).

## Status
- [x] Step 1
- [x] Step 2
- [x] Step 3

## Decisions
- None yet.

## Risks
- Missing model API key or validator JSON output could fail LLM verification.
- Total runtime must remain under 15 minutes.

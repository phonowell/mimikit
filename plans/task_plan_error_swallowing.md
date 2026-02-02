# Task Plan: Fix error swallowing and remove unnecessary try/catch

## Goals
- Identify silent catch blocks and unnecessary try/catch usage.
- Replace with explicit error propagation.
- Introduce a `safe()` wrapper that logs context without swallowing errors.
- Validate changes minimally and update plan status as work progresses.

## Steps
1. [x] Scan codebase for catch blocks and silent error handling; triage candidates.
2. [x] Design/implement `safe()` utility and update usages where appropriate.
3. [x] Remove unnecessary try/catch and ensure errors propagate with context.
4. [ ] Sanity-check build/lint or minimal runtime checks if needed; finalize.

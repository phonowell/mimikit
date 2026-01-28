# Task Plan: roi-fix

## Goal
- Identify 10 urgent issues; fix top 5 by ROI with minimal, elegant changes.

## Plan
1. Survey runtime/worker/verify/task loop for failure/timeout/output handling gaps; list 10 issues. (completed)
2. Implement top 5 fixes in worker + verify with minimal diffs. (completed)
3. Validate changes (lightweight run) and update plan/notes. (completed)
4. Review changes with review-code-changes skill; merge to main. (pending)

## Decisions
- Proceed without plan confirmation per user instruction (no questions).

## Risks
- Timeout handling changes may alter failure modes; ensure error messages are explicit.

## Progress
- 3/4

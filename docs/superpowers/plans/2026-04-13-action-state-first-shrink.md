# Action State-First Shrink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild manager action authorization around runtime truth by deleting continuation-style protocol shells, leaving only schema legality, runtime legality, and risk gates.

**Architecture:** First remove contract fields and validator branches that duplicate runtime decisions. Then let apply/runtime handle paused-task resume and reuse directly while validation only checks legality and risk. Finish by syncing prompts/docs/root guidance and rerunning manager verification.

**Tech Stack:** TypeScript, Vitest, Markdown prompt/docs

---

### Task 1: Remove Parallel Orchestration Fields

**Files:**
- Modify: `src/policy/manager/manager-turn-schema.ts`
- Modify: `src/policy/manager/manager-turn.ts`
- Modify: `src/policy/manager/runner.ts`
- Modify: `src/policy/manager/runner-types.ts`
- Modify: `src/policy/manager/loop-batch-exec.ts`
- Modify: `src/policy/manager/loop-batch-run-rounds.ts`
- Delete: `src/policy/manager/task-result-stop-decision.ts`
- Test: `tests/manager-turn-continuation-anchor.test.ts`
- Test: `tests/manager-turn-output-schema.test.ts`

### Task 2: Delete Follow-Up and Continuation Trapdoors

**Files:**
- Modify: `src/policy/manager/loop-batch-round-followup.ts`
- Modify: `src/policy/manager/loop-batch-correction-reply.ts`
- Delete: `src/policy/manager/action-continuation-anchor.ts`
- Delete: `src/policy/manager/action-intent-evidence-enqueue-continuation.ts`
- Delete: `src/policy/manager/action-intent-evidence-set-plan-structure.ts`
- Delete: `src/policy/manager/action-intent-evidence-set-plan.ts`
- Delete: `src/policy/manager/action-intent-evidence-replacement-cancel.ts`
- Delete: `tests/manager-intent-evidence-continuation-anchor.test.ts`
- Delete: `tests/manager-intent-evidence-continuation-anchor-result-only.test.ts`
- Delete: `tests/manager-intent-evidence-continuation-anchor-weak-signal.test.ts`
- Delete: `tests/manager-intent-evidence-continuation-anchor-fallback.test.ts`
- Delete: `tests/manager-intent-evidence-replacement-cancel.test.ts`

### Task 3: Move Resume/Reuse Decisions Back Into Runtime

**Files:**
- Modify: `src/policy/manager/action-intent-evidence.ts`
- Delete: `src/policy/manager/action-intent-evidence-enqueue.ts`
- Delete: `src/policy/manager/action-intent-evidence-set-plan-validation.ts`
- Delete: `src/policy/manager/action-intent-evidence-task-control.ts`
- Modify: `src/policy/manager/action-validation-enqueue-task.ts`
- Modify: `src/policy/manager/action-apply-create.ts`
- Modify: `src/policy/manager/action-apply-create-shared.ts`
- Test: `tests/manager-enqueue-resume-existing.test.ts`
- Test: `tests/manager-intent-evidence-set-plan-result-only.test.ts`
- Test: `tests/manager-intent-evidence-delete-plan.test.ts`
- Test: `tests/manager-action-apply/enqueue-dedupe-scenarios.ts`

### Task 4: Sync Prompt/Docs/Root Guidance

**Files:**
- Modify: `prompts/manager/action-surface.md`
- Modify: `prompts/manager/system.md`
- Modify: `prompts/manager/action-feedback-hints.md`
- Modify: `prompts/manager/action-evidence-hints.md`
- Modify: `docs/design/workflow/action.md`
- Modify: `docs/design/workflow/plan.md`
- Modify: `docs/design/workflow/task-and-action.md`
- Modify: `docs/design/architecture/system-architecture.md`
- Modify: `docs/superpowers/specs/2026-04-13-action-state-first-shrink-design.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

### Task 5: Verify Manager Surface

**Files:**
- Modify: any touched tests above

- [ ] Run focused Vitest coverage for manager turn, intent-evidence, resume/reuse, and action apply behavior
- [ ] Run `pnpm run type-check`
- [ ] Run `pnpm run review-code-changes`

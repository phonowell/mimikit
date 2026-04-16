# Test ROI Prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete or collapse low-ROI tests until total `test(...)` count drops by at least 30%, while adding a hard “no real cost” test guard.

**Architecture:** Prefer deleting entire low-value test files over rewriting them. Keep only core state-transition, authorization, and integration tests. Add one shared Vitest setup file that strips real provider credentials and blocks non-local network fetches.

**Tech Stack:** TypeScript, Vitest, pnpm

---

### Task 1: Add Zero-Cost Test Guard

**Files:**
- Create: `tests/setup-cost-guard.ts`
- Modify: `vitest.config.ts`
- Test: `tests/test-cost-guard.test.ts`

- [x] Add a global Vitest setup file that deletes common real provider env vars before each test and restores them after each test
- [x] Block `fetch` calls to non-local hosts unless a test explicitly stubs `globalThis.fetch`
- [x] Allow local loopback hosts for CLI / HTTP integration tests
- [x] Add one focused test file proving external fetch is blocked and localhost fetch is allowed

### Task 2: Delete Low-ROI WebUI Tests

**Files:**
- Delete: `tests/webui-*.test.ts`

- [x] Remove static render / formatting / copy-feedback / branding tests in the WebUI layer
- [x] Keep WebUI value through build and higher-level HTTP/integration coverage rather than DOM string assertions

### Task 3: Delete Low-ROI Prompt / Reply Tests

**Files:**
- Delete: `tests/*prompt*.test.ts`
- Delete: `tests/*reply*.test.ts`
- Delete: `tests/manager-loop-helpers.test.ts`

- [x] Remove prompt-template wording tests and reply phrasing tests that primarily assert literal strings
- [x] Keep core manager / worker behavior through state, guard, and integration tests that do not depend on wording

### Task 4: Delete Auxiliary Guard / Archive Tests

**Files:**
- Delete: `tests/task-results-archive.test.ts`
- Delete: `tests/focus-result-feedback.test.ts`
- Delete: `tests/manager-task-control-feedback.test.ts`
- Delete: `tests/manager-task-contract-validation.test.ts`
- Delete: `tests/manager-correction-clarify-evidence.test.ts`
- Delete: `tests/manager-correction-clarify-replies.test.ts`
- Delete: `tests/manager-correction-intent-evidence-followup.test.ts`
- Delete: `tests/manager-task-result-closure-pending.test.ts`
- Delete: `tests/manager-remember-memory-guard.test.ts`
- Delete: `tests/manager-project-profile-guard.test.ts`
- Delete: `tests/manager-enqueue-task-guard.test.ts`

- [x] Remove tests whose main value is checking hint wording, auxiliary fail-soft messaging, or archive/render phrasing
- [x] Re-run a representative manager core subset after deletion to confirm no hidden dependency on those files

### Task 5: Verify Count Reduction and Full Suite

**Files:**
- Modify if needed: `plans/task_plan_test-roi-prune-20260415.md`

- [x] Recount `test(...)` total and confirm final count is `<=322` (`398 -> 314`, `-84`)
- [x] Run targeted tests for the new cost guard and a representative manager core subset (superseded by full suite pass)
- [x] Run `pnpm run review-code-changes`
- [x] Record the before/after counts and final deletion delta in the task plan

# Manager And Worker Prompt Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the manager and worker prompt stack so it matches MIMIKIT's orchestration-first product goals without adding protocol or prompt complexity.

**Architecture:** Keep the prompt input wrappers that runtime still uses (`M:*`), but rewrite prompt content around a smaller set of stable responsibilities. Worker completion now uses structured JSON output instead of tag-based handoff markers.

**Tech Stack:** TypeScript ESM, Nunjucks prompt templates, Vitest, Markdown docs

---

### Task 1: Lock The New Manager Prompt Contract

**Files:**
- Modify: `tests/manager-project-profile-prompt.test.ts`
- Modify: `prompts/manager/system.md`

- [ ] **Step 1: Write the failing test**

Add assertions that the manager prompt identifies itself as `MIMIKIT`, describes itself as the main orchestration layer, preserves only `目标、计划、当前状态、验收门禁`, and treats the filesystem as truth.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/manager-project-profile-prompt.test.ts`
Expected: FAIL because the current prompt still says `MIMIKIT Manager Lite` and lacks the new orchestration wording.

- [ ] **Step 3: Rewrite the manager system prompt**

Trim historical implementation notes, move the project goal boundary to the top, keep action legality checks, and preserve only necessary protocol-facing sections.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/manager-project-profile-prompt.test.ts`
Expected: PASS

### Task 2: Lock The New Worker Prompt Contract

**Files:**
- Modify: `tests/worker-build-prompt-resume-instruction.test.ts`
- Modify: `prompts/worker/system.md`
- Inline worker identity + execution contract into `prompts/worker/system.md`; avoid single-use include shells with stale names
- Modify: `prompts/worker/task-prompt-hints.md`
- Modify: `prompts/worker/cron-trigger-context.md`

- [ ] **Step 1: Write the failing test**

Update worker prompt assertions to require the new execution-layer wording, the input-priority ordering, and the shorter protocol guidance.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/worker-build-prompt-resume-instruction.test.ts tests/worker-task-prompt-budget.test.ts`
Expected: FAIL because current worker prompt wording still reflects the old layout.

- [ ] **Step 3: Rewrite the worker prompt stack**

Keep `M:prompt`, `M:focus_brief`, `M:resume_instruction`, and `M:environment`, but remove comment-heavy scaffolding and rewrite helper text around the execution contract.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/worker-build-prompt-resume-instruction.test.ts tests/worker-task-prompt-budget.test.ts`
Expected: PASS

### Task 3: Simplify Supporting Prompt Copy

**Files:**
- Modify: `prompts/manager/action-evidence-hints.md`
- Modify: `prompts/manager/action-feedback-hints.md`
- Modify: `prompts/manager/fallback-reply.md`
- Modify: `prompts/manager/system-fallback-reply.md`

- [ ] **Step 1: Rewrite copy without changing runtime keys**

Shorten feedback/fallback prose so these prompts carry only actionable contract feedback, not extra role coaching or stale terminology.

- [ ] **Step 2: Run focused prompt tests**

Run: `pnpm test tests/manager-action-surface-prompt.test.ts`
Expected: PASS

### Task 4: Sync Prompt Design Docs

**Files:**
- Modify: `docs/design/workflow/action.md`
- Modify: `docs/design/workflow/prompt-governance.md`
- Modify: `docs/design/architecture/runners.md`
- Modify: `docs/design/workflow/task.md`
- Modify: `docs/BOOTSTRAP.md`

- [ ] **Step 1: Update docs to match the new prompt boundaries**

Document the orchestration-first manager prompt, the execution-first worker prompt, and the fact that protocol tags remain while explanatory scaffolding shrinks.

- [ ] **Step 2: Sanity-check docs against prompt files**

Read the updated docs and prompt sources side by side; ensure no stale `Manager Lite` or old prompt-shape claims remain.

### Task 5: Full Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused regression suite**

Run: `pnpm test tests/manager-project-profile-prompt.test.ts tests/manager-action-surface-prompt.test.ts tests/worker-build-prompt-resume-instruction.test.ts tests/worker-task-prompt-budget.test.ts tests/prompt-task-content.test.ts`
Expected: PASS

- [ ] **Step 2: Run lint on touched prompt/doc/test paths**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Report exact changed files and verification evidence**

Summarize the prompt contract changes, doc sync, and command outputs without claiming anything that was not freshly verified.

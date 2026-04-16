# Documentation Implementation Sync Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository documentation match the current implementation after the recent manager simplification and test-prune work.

**Architecture:** Treat code as ground truth, not prior plans or wording. Audit only the docs that describe current runtime behavior, prompt surface, config surface, and workflow boundaries; update or delete stale statements instead of adding compatibility explanations.

**Tech Stack:** Markdown, TypeScript source as truth, pnpm verification

---

### Task 1: Rebuild the Ground-Truth Checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-04-16-doc-impl-sync.md`
- Read: `src/policy/manager/*.ts`
- Read: `src/policy/prompts/*.ts`
- Read: `src/bootstrap/config*.ts`
- Read: `src/surface/shared/*.ts`

- [ ] Record the concrete implementation facts that docs must match: manager single-pass degrade behavior, removed config knobs, current packet fields, current system-event set, current action surface, and retained log events.
- [x] Record the concrete implementation facts that docs must match: manager single-pass degrade behavior, removed config knobs, current packet fields, current system-event set, current action surface, and retained log events.
- [x] List stale concepts to eliminate from docs: `maxCorrectionRounds`, `manager_round_limit`, `M:event_packet.action_feedback`, `expanded` packet mode, `remember_project_profile`, and any wording that implies a second repair round.

Notes:
- Audit confirmed the current authority docs were already aligned in `docs/design/architecture/system-architecture.md`, `docs/design/workflow/interfaces-and-state.md`, `docs/design/workflow/action.md`, `docs/design/workflow/memory.md`, and the `prompts/manager/*.md` prompt docs.
- Remaining drift was concentrated in dated runbooks/specs that still used present-tense wording for removed guard/test surfaces.

### Task 2: Sync Architecture and Workflow Docs

**Files:**
- Modify: `docs/design/architecture/system-architecture.md`
- Modify: `docs/design/architecture/runners.md`
- Modify: `docs/design/workflow/action.md`
- Modify: `docs/design/workflow/interfaces-and-state.md`
- Modify: `docs/design/workflow/memory.md`

- [x] Rewrite stale behavior statements so they describe the current runtime exactly.
- [x] Keep only current concepts; delete retired protocol/history text instead of explaining migrations.
- [x] Recheck each edited doc against the corresponding source file before moving on.

Notes:
- No edits were needed in the current architecture/workflow docs after source recheck; they already matched `src/policy/manager/*`, `src/policy/prompts/*`, and current config/runtime surfaces.

### Task 3: Sync Prompt and Runbook Docs

**Files:**
- Modify: `prompts/manager/system.md`
- Modify: `prompts/manager/context.md`
- Modify: `prompts/manager/action-surface.md`
- Modify: `docs/runbook/stable-preference-alignment-2026-03-31.md`
- Modify: `docs/superpowers/specs/2026-04-15-test-roi-prune-design.md`

- [x] Remove prompt-facing claims that no longer exist in code.
- [x] Update runbook/spec text where it still describes deleted guard/protocol surfaces as if they are live.
- [x] Keep prompt docs aligned with the actual prompt builders and action surface templates.

Notes:
- Updated dated docs to either match current implementation directly or carry explicit historical notes when they describe superseded intermediate designs.
- Edited files:
  - `docs/runbook/stable-preference-alignment-2026-03-31.md`
  - `docs/runbook/runtime-git-reconcile-shrink-2026-03-31.md`
  - `docs/runbook/task-control-cancel-contract-2026-03-28.md`
  - `docs/runbook/manager-rule-solidification-2026-03-29.md`
  - `docs/runbook/manager-explanation-layer-2026-03-31.md`
  - `docs/superpowers/specs/2026-04-01-manager-middle-management-design.md`
  - `docs/superpowers/specs/2026-04-13-action-state-first-shrink-design.md`
  - `docs/superpowers/specs/2026-04-15-test-roi-prune-design.md`

### Task 4: Verify and Close

**Files:**
- Modify: `docs/superpowers/plans/2026-04-16-doc-impl-sync.md`

- [x] Run `pnpm test` in the new worktree to confirm the isolated workspace baseline is healthy after dependency install.
- [x] Run `pnpm run review-code-changes` after doc edits.
- [x] Re-scan the repo for the retired doc claims and confirm only intentional historical mentions remain.
- [x] Mark this plan complete with a short before/after note.

Before/after:
- Before: several dated runbooks/specs still described removed `intent-evidence`, `decision`, correction-round, and deleted test surfaces as if they were part of the current implementation.
- After: current docs stay unchanged where already accurate; the stale dated docs now either describe the current behavior directly or are explicitly marked as historical/superseded.

Verification:
- `pnpm test` -> `95` files / `327` tests passed
- `pnpm run review-code-changes` -> exit `0`
- Repo re-scan confirmed only intentional historical mentions remain outside current design/workflow docs.

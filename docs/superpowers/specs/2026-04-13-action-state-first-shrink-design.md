# Action State-First Shrink Design

> Historical note (2026-04-16): this document captured an intermediate shrink step. The remaining `intent-evidence` boundary described below was later removed; current manager authorization is `schema/shape -> runtime legality -> risk gate`.

**Goal:** Remove the root-level protocol drift in manager actions so authorization follows runtime truth and risk boundaries instead of making the model re-prove state.

**Scope:** Manager turn contract, action validation/apply behavior, prompt/workflow docs, and root guidance in `CLAUDE.md` / `AGENTS.md`.

## Problem

The original drift was deeper than “protocol-first”. We made the model repeatedly prove facts that runtime already knew:

- `decision` re-stated stop semantics already present in `reply + actions`.
- `continuation_of` tried to turn “this is the same thread of work” into a model-filled contract field.
- result-only follow-up rejection added another orchestration layer that could block legitimate reply-only turns.
- `resume-existing` / `replacement-cancel` / set-plan diff interpretation moved runtime state decisions into validation-time protocol branches.

The result was predictable:

- low-risk continuation got blocked because wording or anchors drifted
- validation started making runtime decisions before apply/state machine had a chance
- fixes added more hints, fallbacks, and side channels instead of shrinking the model surface

## Design Principles

1. Authorization must stay minimal: `schema/shape -> runtime legality -> risk gate`.
2. Runtime is the only place allowed to decide reuse, resume, dedupe, or exact continuation based on fingerprint/state.
3. High-risk actions require fresh user intent; low-risk continuation should not require extra self-proving protocol.
4. If a hint does not enter runtime truth, it does not belong in the action contract.

## Changes

### 1. Remove duplicate orchestration fields

- manager turn stays `{ reply, actions }`
- no top-level `decision`
- no `continuation_of` on `enqueue_task` or `set_plan`

Rationale:

- these fields did not add stable truth
- they only created extra ways for the model to fail formatting or re-proving the same state

### 2. Delete validation-time state guesses

Removed concepts:

- continuation-anchor validation
- `enqueue_task -> resume` prevalidation redirect
- `replacement-cancel` authorization special-case
- set-plan diff/structure authorization layer

Replacement rule:

- validation checks legality and risk
- apply/runtime handles exact paused fingerprint resume, pending reuse, and state-machine transitions

### 3. Historical intermediate step: keep intent-evidence only for real risk boundaries

Still gated by direct current user input:

- `enqueue_task(write)`
- `set_plan(write)`
- `task_control(pause|cancel)`
- `delete_plan`
- memory/profile writes through provenance requirements

No longer gated by text-overlap continuation logic:

- `enqueue_task(read)`
- `set_plan(read)`
- `task_control(resume)`

For high-risk write continuation/update:

- if the user directly references the current `plan/task`, authorization should prefer that object-level reference
- but object reference alone is not enough to rewrite the object into an unrelated goal

### 4. Sync docs with the new mental model

Root guidance and workflow docs now explicitly record:

- do not add contract fields that runtime does not own
- do not duplicate runtime state decisions in validation
- do not expand guardrails from “block risk” into “force protocol repairs”

## Expected Outcome

- simpler manager action surface
- fewer false rejections on normal continuation
- clearer separation between validation and runtime state machine
- less room for future “patch the protocol” drift

## Non-Goals

- no compatibility aliases
- no new action families
- no expansion of manager direct execution
- no second orchestration layer for handoff/result follow-up

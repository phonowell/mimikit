# Multi-Focus Goal Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-anchor `mimikit` around single-session, multi-focus project advancement so docs, prompts, routing, and low-risk continuation all serve sustained project progress instead of protocol completeness.

**Architecture:** Land this in four ordered slices. First rewrite the product north star in root/docs so every later change has one source of truth. Second teach manager/prompt packet building to treat multiple independent worklines as first-class runtime context. Third relax low-risk routing/continuation logic so the manager can keep moving without brittle evidence traps. Finish by tightening user-visible replies so the system stays natural and does not leak internal orchestration concepts.

**Tech Stack:** TypeScript (ESM), Vitest, Markdown prompts/docs

---

### Task 1: Reset Root North Star and Boundary Docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/design/architecture/system-architecture.md`
- Modify: `docs/design/workflow/focus.md`
- Modify: `docs/design/workflow/plan.md`
- Modify: `docs/design/workflow/task.md`
- Modify: `docs/design/workflow/task-and-action.md`
- Modify: `docs/superpowers/specs/2026-04-14-multi-focus-project-manager-design.md`

- [ ] **Step 1: Create the worktree for the implementation slice**

Run:

```bash
mkdir -p .worktrees
git worktree add .worktrees/multi-focus-goal-reset -b feat/multi-focus-goal-reset origin/main
```

Expected: a fresh worktree at `.worktrees/multi-focus-goal-reset` on branch `feat/multi-focus-goal-reset`

- [ ] **Step 2: Rewrite root positioning in `AGENTS.md`**

Replace the current product overview / goal boundary framing with language along these lines:

```md
## 项目概览

- 目标：帮助用户在单 session 中持续推进多个独立项目重心，达成目标、不漂移、不串线。
- 定位：产品是单 session、多重心、自然交互的 AI 项目推进主管；实现是承担推进责任的编排中层，不直接执行主要任务。
- 特点：默认长期自主推进、尽量少打扰用户；对外自然交互，对内维护多工作线隔离、纠偏、验收与续跑。
```

- [ ] **Step 3: Align architecture/workflow docs with the new hierarchy**

Update the architecture and workflow docs so they all say the same thing:

```md
- `focus` 是工作线归属与隔离单元，不是暴露给用户操作的任务板。
- `plan` 是当前推进路径假说，不是最高真相源。
- `task` 承载局部执行合同；多个 task 可归属于不同 workline。
- manager 的第一职责是持续推进项目组合，而不是证明协议完备。
```

- [ ] **Step 4: Verify doc consistency and formatting**

Run:

```bash
git diff --check -- AGENTS.md docs/design/architecture/system-architecture.md docs/design/workflow/focus.md docs/design/workflow/plan.md docs/design/workflow/task.md docs/design/workflow/task-and-action.md docs/superpowers/specs/2026-04-14-multi-focus-project-manager-design.md
```

Expected: no output

- [ ] **Step 5: Commit the doc baseline**

Run:

```bash
git add AGENTS.md docs/design/architecture/system-architecture.md docs/design/workflow/focus.md docs/design/workflow/plan.md docs/design/workflow/task.md docs/design/workflow/task-and-action.md docs/superpowers/specs/2026-04-14-multi-focus-project-manager-design.md
git commit -m "docs: reset product north star to multi-focus project manager"
```

Expected: one docs-only commit with the new north star

### Task 2: Make Multi-Focus Routing First-Class in Manager Context

**Files:**
- Modify: `src/policy/manager/loop-batch-primary-focus.ts`
- Modify: `src/policy/prompts/manager-context-packet.ts`
- Modify: `src/policy/prompts/manager-prompt-packet-build.ts`
- Modify: `src/policy/prompts/manager-prompt-packet-content.ts`
- Modify: `src/policy/prompts/manager-prompt-types.ts`
- Modify: `src/persistence/storage/manager-packet-schema.ts`
- Modify: `tests/manager-batch-primary-focus.test.ts`
- Modify: `tests/manager-context-digests.test.ts`
- Modify: `tests/manager-prompt-runtime-demand.test.ts`

- [ ] **Step 1: Write the failing tests for ordered multi-focus selection**

Add scenarios that assert manager context keeps more than one active workline candidate:

```ts
it('returns ordered working focus ids for independent active worklines', () => {
  expect(resolveBatchWorkingFocusIds({
    runtime,
    inputs: [userInputForFocusA, userInputForFocusB],
    results: [resultForFocusB],
  })).toEqual(['focus-b', 'focus-a'])
})

it('keeps trigger-driven focus without dropping the most recent user focus', () => {
  expect(resolveBatchWorkingFocusIds({
    runtime,
    inputs: [triggerInputForPlanC, recentUserInputForFocusA],
    results: [],
  })).toEqual(['focus-a', 'focus-c'])
})
```

- [ ] **Step 2: Run the focused tests to confirm current single-focus behavior fails**

Run:

```bash
pnpm vitest run tests/manager-batch-primary-focus.test.ts tests/manager-context-digests.test.ts tests/manager-prompt-runtime-demand.test.ts
```

Expected: failure because current runtime returns a single primary focus and packet content does not expose an ordered workline set

- [ ] **Step 3: Implement ordered workline resolution and packet exposure**

Refactor the focus resolver shape from “single primary focus” to “ordered working focus ids”:

```ts
export const resolveBatchWorkingFocusIds = (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
  results: TaskResult[]
}): FocusId[] => dedupeFocusIds([
  resolveLatestUserFocusId(...),
  resolveLatestResultFocusId(...),
  resolveLatestTriggerFocusId(...),
  ...resolveLatestOpenTaskFocusIds(...),
  ...resolveRecentActiveFocusIds(...),
  resolveDefaultFocusId(params.runtime),
])
```

Mirror that change in packet building so `state_packet` exposes a compact ordered workline set rather than implying one canonical focus.

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
pnpm vitest run tests/manager-batch-primary-focus.test.ts tests/manager-context-digests.test.ts tests/manager-prompt-runtime-demand.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the routing baseline**

Run:

```bash
git add src/policy/manager/loop-batch-primary-focus.ts src/policy/prompts/manager-context-packet.ts src/policy/prompts/manager-prompt-packet-build.ts src/policy/prompts/manager-prompt-packet-content.ts src/policy/prompts/manager-prompt-types.ts src/persistence/storage/manager-packet-schema.ts tests/manager-batch-primary-focus.test.ts tests/manager-context-digests.test.ts tests/manager-prompt-runtime-demand.test.ts
git commit -m "feat: model multi-focus routing in manager context"
```

Expected: one commit that makes multi-focus runtime context explicit

### Task 3: Shrink Low-Risk Routing and Continuation Guards

**Files:**
- Modify: `src/policy/manager/action-intent-evidence.ts`
- Modify: `src/policy/manager/action-intent-evidence-match.ts`
- Modify: `src/policy/manager/action-intent-evidence-write-target.ts`
- Modify: `src/policy/manager/authorization-semantics.ts`
- Modify: `src/policy/manager/action-validation-enqueue-task.ts`
- Modify: `src/policy/manager/loop-batch-round-followup.ts`
- Modify: `tests/task-route-actions.test.ts`
- Modify: `tests/manager-intent-evidence-guard.test.ts`
- Modify: `tests/manager-intent-evidence-write-object-reference.test.ts`
- Modify: `tests/manager-result-followup-plan-anchor-multi.test.ts`

- [ ] **Step 1: Write failing tests for “continue when likely, ask only when ambiguous”**

Add assertions for the new routing rule:

```ts
it('continues on the most likely workline when signals converge', () => {
  expect(result.ok).toBe(true)
  expect(result.mode).toBe('continue')
})

it('asks for lightweight confirmation when competing worklines stay ambiguous', () => {
  expect(result.ok).toBe(false)
  expect(result.reason).toBe('ambiguous_workline')
})
```

- [ ] **Step 2: Run the focused routing/guard tests**

Run:

```bash
pnpm vitest run tests/task-route-actions.test.ts tests/manager-intent-evidence-guard.test.ts tests/manager-intent-evidence-write-object-reference.test.ts tests/manager-result-followup-plan-anchor-multi.test.ts
```

Expected: failure because current guard stack still over-weights brittle proof requirements and single-focus assumptions

- [ ] **Step 3: Implement the new low-risk authorization semantics**

Keep the gate small: semantic match, object/workline ownership, runtime legality, risk.

```ts
if (riskLevel === 'high') return requireCurrentUserSupport(...)
if (matchedWorkline.confidence >= 0.7) return allowLowRiskContinuation(...)
return rejectWithLightweightClarification('ambiguous_workline')
```

Do not reintroduce continuation shells, source-quote requirements, or extra protocol-only declarations.

- [ ] **Step 4: Re-run the focused routing/guard tests**

Run:

```bash
pnpm vitest run tests/task-route-actions.test.ts tests/manager-intent-evidence-guard.test.ts tests/manager-intent-evidence-write-object-reference.test.ts tests/manager-result-followup-plan-anchor-multi.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the guard shrink**

Run:

```bash
git add src/policy/manager/action-intent-evidence.ts src/policy/manager/action-intent-evidence-match.ts src/policy/manager/action-intent-evidence-write-target.ts src/policy/manager/authorization-semantics.ts src/policy/manager/action-validation-enqueue-task.ts src/policy/manager/loop-batch-round-followup.ts tests/task-route-actions.test.ts tests/manager-intent-evidence-guard.test.ts tests/manager-intent-evidence-write-object-reference.test.ts tests/manager-result-followup-plan-anchor-multi.test.ts
git commit -m "refactor: prefer low-risk continuation over brittle proof gates"
```

Expected: one commit that removes the most harmful continuation friction

### Task 4: Make Manager Replies Natural and Non-Leaky

**Files:**
- Modify: `prompts/manager/system.md`
- Modify: `prompts/manager/action-surface.md`
- Modify: `prompts/manager/fallback-reply.md`
- Modify: `prompts/manager/system-fallback-reply.md`
- Modify: `prompts/manager/action-feedback-hints.md`
- Modify: `prompts/manager/action-evidence-hints.md`
- Modify: `src/policy/manager/task-result-visible-reply.ts`
- Modify: `src/policy/manager/loop-batch-reply.ts`
- Modify: `src/policy/manager/reply-normalize.ts`
- Modify: `tests/manager-correction-clarify-replies.test.ts`
- Modify: `tests/manager-task-result-direct-reply.test.ts`
- Modify: `tests/manager-loop-batch-no-reply.test.ts`

- [ ] **Step 1: Add failing tests for “natural report, minimal concept leakage”**

Use assertions like:

```ts
expect(reply).toContain('当前进展')
expect(reply).toContain('下一步')
expect(reply).not.toContain('enqueue_task')
expect(reply).not.toContain('intent-evidence')
expect(reply).not.toContain('schema')
```

- [ ] **Step 2: Run the reply-focused tests**

Run:

```bash
pnpm vitest run tests/manager-correction-clarify-replies.test.ts tests/manager-task-result-direct-reply.test.ts tests/manager-loop-batch-no-reply.test.ts
```

Expected: failure because current reply surface still reflects internal control concepts too directly

- [ ] **Step 3: Rewrite prompt/reply layers around progress, risk, and next action**

Constrain user-visible reply shapes to this pattern:

```md
- 当前进展：一句话说明这条工作线到了哪里
- 正在处理：系统下一步会做什么
- 当前风险：只有真的会影响推进时才提
- 需要你决定：仅在高风险或长期纠偏失败时出现
```

Keep all internal action/schema/guard names out of user-facing text.

- [ ] **Step 4: Re-run the reply-focused tests**

Run:

```bash
pnpm vitest run tests/manager-correction-clarify-replies.test.ts tests/manager-task-result-direct-reply.test.ts tests/manager-loop-batch-no-reply.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the reply layer change**

Run:

```bash
git add prompts/manager/system.md prompts/manager/action-surface.md prompts/manager/fallback-reply.md prompts/manager/system-fallback-reply.md prompts/manager/action-feedback-hints.md prompts/manager/action-evidence-hints.md src/policy/manager/task-result-visible-reply.ts src/policy/manager/loop-batch-reply.ts src/policy/manager/reply-normalize.ts tests/manager-correction-clarify-replies.test.ts tests/manager-task-result-direct-reply.test.ts tests/manager-loop-batch-no-reply.test.ts
git commit -m "refactor: make manager replies natural and workline-oriented"
```

Expected: one commit with cleaner outward behavior and no internal protocol leakage

### Task 5: Full Verification and Merge Readiness

**Files:**
- Modify: any touched files above if verification exposes regressions

- [ ] **Step 1: Run the focused manager regression suite**

Run:

```bash
pnpm vitest run tests/manager-batch-primary-focus.test.ts tests/manager-context-digests.test.ts tests/manager-prompt-runtime-demand.test.ts tests/task-route-actions.test.ts tests/manager-intent-evidence-guard.test.ts tests/manager-intent-evidence-write-object-reference.test.ts tests/manager-result-followup-plan-anchor-multi.test.ts tests/manager-correction-clarify-replies.test.ts tests/manager-task-result-direct-reply.test.ts tests/manager-loop-batch-no-reply.test.ts
```

Expected: PASS

- [ ] **Step 2: Run repository-wide static verification**

Run:

```bash
pnpm run type-check
pnpm lint
pnpm run review-code-changes
```

Expected: all commands succeed

- [ ] **Step 3: Inspect final diff for concept drift**

Run:

```bash
git diff --stat origin/main...
git diff origin/main... -- AGENTS.md docs/design/architecture/system-architecture.md docs/design/workflow/focus.md docs/design/workflow/plan.md docs/design/workflow/task.md docs/design/workflow/task-and-action.md prompts/manager/system.md prompts/manager/action-surface.md src/policy/manager/loop-batch-primary-focus.ts src/policy/manager/action-intent-evidence.ts src/policy/manager/task-result-visible-reply.ts
```

Expected: changes stay confined to the planned north-star, routing, guard, and reply surfaces

- [ ] **Step 4: Final commit if verification required follow-up fixes**

Run:

```bash
git add -A
git commit -m "chore: finalize multi-focus goal reset verification"
```

Expected: no-op if nothing changed after verification, otherwise one small cleanup commit

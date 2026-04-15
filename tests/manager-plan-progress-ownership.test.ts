import { expect, test } from 'vitest'

import { applyPlanCompletionState } from '../src/policy/manager/plan-progress.js'
import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'

import {
  createPlanProgressRuntime,
  createTriggeredEnqueuePlan,
} from './helpers/manager-plan-progress.js'

test('applyPlanCompletionState does not copy a stage digest into an unrelated plan that only shares lastTaskId', async () => {
  const runtime = await createPlanProgressRuntime()
  runtime.domain.taskPlans.push(
    createTriggeredEnqueuePlan({
      id: 'plan-stage-digest-owned',
      title: 'auth guard stage digest',
      cwd: '/repo/mimikit',
      focusId: GLOBAL_FOCUS_ID,
      taskKey: 'task-key-stage-digest-owned',
      executionSpecId: 'spec-stage-digest-owned',
      taskTemplateTitle: 'auth guard stage digest task',
      taskContract: {
        goal: 'Continue auth guard',
        scope: 'Only auth guard',
        acceptance: ['Auth guard finished'],
      },
      trigger: {
        mode: 'on_worker_slot_freed',
      },
      createdAt: '2026-04-02T00:00:00.000Z',
      runtime: {
        runCount: 1,
        lastTaskId: 'task-stage-shared',
      },
    }),
    createTriggeredEnqueuePlan({
      id: 'plan-stage-digest-unrelated',
      title: 'billing retry digest',
      cwd: '/repo/billing',
      focusId: 'focus-billing',
      taskKey: 'task-key-stage-digest-unrelated',
      executionSpecId: 'spec-stage-digest-unrelated',
      taskTemplateTitle: 'billing retry digest task',
      taskContract: {
        goal: 'Rebuild billing retry pipeline',
        scope: 'Only billing retry pipeline',
        acceptance: ['Billing retry finished'],
      },
      trigger: {
        mode: 'on_worker_slot_freed',
      },
      createdAt: '2026-04-02T00:00:00.000Z',
      runtime: {
        runCount: 1,
        lastTaskId: 'task-stage-shared',
      },
    }),
  )

  applyPlanCompletionState(runtime, [
    {
      taskId: 'task-stage-shared',
      title: 'auth guard stage digest task',
      status: 'succeeded',
      ok: true,
      output: '',
      completedAt: '2026-04-02T00:10:00.000Z',
      durationMs: 15,
      handoff: {
        summary: 'auth guard 当前阶段已完成。',
        risks: ['auth 回归验证还未跑完。'],
      },
      stopReason: 'completed',
    },
  ])

  expect(runtime.domain.taskPlans[0]?.runtime.stage).toEqual({
    summary: 'auth guard 当前阶段已完成。',
    risk: 'auth 回归验证还未跑完。',
    needsDecision: false,
    sourceTaskId: 'task-stage-shared',
    updatedAt: '2026-04-02T00:10:00.000Z',
  })
  expect(runtime.domain.taskPlans[1]?.runtime.stage).toBeUndefined()
})

test('applyPlanCompletionState does not copy a stage digest into a sole matched plan when result semantics disagree', async () => {
  const runtime = await createPlanProgressRuntime()
  runtime.domain.taskPlans.push(
    createTriggeredEnqueuePlan({
      id: 'plan-stage-digest-sole-unrelated',
      title: 'billing retry digest',
      cwd: '/repo/billing',
      focusId: 'focus-billing',
      taskKey: 'task-key-stage-digest-sole-unrelated',
      executionSpecId: 'spec-stage-digest-sole-unrelated',
      taskTemplateTitle: 'billing retry digest task',
      taskContract: {
        goal: 'Rebuild billing retry pipeline',
        scope: 'Only billing retry pipeline',
        acceptance: ['Billing retry finished'],
      },
      trigger: {
        mode: 'on_worker_slot_freed',
      },
      createdAt: '2026-04-02T00:00:00.000Z',
      runtime: {
        runCount: 1,
        lastTaskId: 'task-stage-sole-shared',
      },
    }),
  )

  applyPlanCompletionState(runtime, [
    {
      taskId: 'task-stage-sole-shared',
      title: 'auth guard stage digest task',
      status: 'succeeded',
      ok: true,
      output: '',
      completedAt: '2026-04-02T00:10:00.000Z',
      durationMs: 15,
      handoff: {
        summary: 'auth guard 当前阶段已完成。',
      },
      stopReason: 'completed',
    },
  ])

  expect(runtime.domain.taskPlans[0]?.runtime.stage).toBeUndefined()
})

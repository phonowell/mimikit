import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceTask } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('enqueue_task stays blocked when explicit plan continuation_of shares the lane but is semantically unrelated', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-unrelated-explicit-anchor',
    title: '重构 billing retry 主线',
    focusId: 'focus-inbox',
    status: 'active',
    runtime: {
      runCount: 2,
      lastTaskId: 'task-finished-billing-explicit-anchor',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-unrelated-explicit-anchor',
      taskContract: {
        goal: '重构 billing retry 主线并完成回归验证',
        scope: '只处理 billing retry pipeline',
        acceptance: ['billing retry 主链完成'],
      },
      taskTemplate: {
        title: '重构 billing retry 主线',
        executionSpecId: 'spec-unrelated-explicit-anchor',
        cwd: '/repo/mimikit',
        resourceMode: 'write',
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        continuation_of: {
          type: 'plan',
          id: currentPlan.id,
        },
        task: {
          title: '继续收敛 auth guard 主线',
          cwd: '/repo/mimikit',
          mode: 'write',
          goal: '继续收敛 auth guard 主线并落地代码修改',
          in_scope: ['只处理 auth guard 主线'],
          out_of_scope: [],
          done_when: ['auth guard 主线完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      taskById: new Map(),
      taskStatusById: new Map(),
      resultTaskIds: new Set(['task-finished-billing-explicit-anchor']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

test('set_plan stays blocked when explicit task continuation_of shares the lane but rewrites to an unrelated plan', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-billing-plan-rewrite',
    title: '重构 billing retry 主线',
    cwd: '/repo/mimikit',
    focusId: 'focus-inbox',
    status: 'succeeded',
    contract: {
      goal: '重构 billing retry 主线并完成回归验证',
      scope: '只处理 billing retry pipeline',
      acceptance: ['billing retry 主链完成'],
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: null,
        continuation_of: {
          type: 'task',
          id: finishedTask.id,
        },
        plan: {
          title: '继续收敛 auth guard 主线',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: '继续收敛 auth guard 主线',
            cwd: '/repo/mimikit',
            mode: 'write',
            goal: '继续收敛 auth guard 主线并落地代码修改',
            in_scope: ['只处理 auth guard 主线'],
            out_of_scope: [],
            done_when: ['auth guard 主线完成'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: 1,
        },
      },
    ],
    {
      inputs: [],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      resultTaskIds: new Set([finishedTask.id]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_plan')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

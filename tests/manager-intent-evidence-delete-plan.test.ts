import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('delete_plan stays blocked when current user input does not identify the target plan', () => {
  const plan = createPlanFixture({
    id: 'plan-delete-target',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'delete_plan',
        plan_id: plan.id,
      },
    ],
    {
      inputs: [createUserInput('先看看现在有哪些计划。')],
      planById: new Map([[plan.id, plan]]),
      planStatusById: new Map([[plan.id, plan.status]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('delete_plan')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

test('delete_plan stays allowed when current user input directly references the target plan', () => {
  const plan = createPlanFixture({
    id: 'plan-delete-target-direct',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'delete_plan',
        plan_id: plan.id,
      },
    ],
    {
      inputs: [
        createUserInput(`请关闭 ${plan.id}，也就是 ${plan.title} 这个计划。`),
      ],
      planById: new Map([[plan.id, plan]]),
      planStatusById: new Map([[plan.id, plan.status]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

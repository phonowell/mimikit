import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'

import type { TaskPlan } from '../src/foundation/types/index.js'

test('set_plan update stays blocked when user only references the current plan but rewrites it to an unrelated goal', () => {
  const currentPlan: TaskPlan = {
    id: 'plan-auth-only-reference',
    title: 'Auth hardening',
    focusId: 'focus-inbox',
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'on_worker_slot_freed',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-only-reference',
      taskContract: {
        goal: 'Harden auth guard',
        scope: 'Only auth guard',
        acceptance: ['Auth hardening completed'],
      },
      taskTemplate: {
        title: 'Auth hardening',
        executionSpecId: 'spec-auth-only-reference',
        cwd: '/repo/mimikit',
        resourceMode: 'write',
      },
    },
    createdAt: '2026-03-29T03:00:00.000Z',
    updatedAt: '2026-03-29T03:00:00.000Z',
    runtime: {
      runCount: 0,
    },
  }

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
        plan: {
          title: 'Billing retry overhaul',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: 'Billing retry overhaul',
            cwd: '/repo/mimikit',
            mode: 'write',
            goal: 'Rebuild billing retry pipeline',
            in_scope: ['Only billing retry pipeline'],
            out_of_scope: [],
            done_when: ['Billing retry pipeline finished'],
            context_refs: [],
            instructions: [],
          },
          priority: 'high',
          max_runs: null,
        },
      },
    ],
    {
      inputs: [createUserInput('更新一下 Auth hardening 这个计划。')],
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      planById: new Map([[currentPlan.id, currentPlan]]),
      supplementalEvidenceSources: new Set(['task_result'] as const),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_plan')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

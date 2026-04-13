import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('enqueue_task(write) stays blocked when the active continuation target matches semantically but rewrites the execution lane without fresh lane evidence', () => {
  const activePlan = createPlanFixture({
    id: 'plan-auth-guard-continuation-lane-shift',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-continuation-lane-shift',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-continuation-lane-shift',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '继续推进 auth guard 主线',
          cwd: '/repo/billing',
          mode: 'write',
          use_worktree: true,
          goal: '继续推进 auth guard 主线并落地下一步实现',
          in_scope: ['只处理 auth guard 主线'],
          out_of_scope: [],
          done_when: ['下一步主线修改完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          '继续推进 auth guard 主线并落地下一步实现，只处理 auth guard 主线，不要停下来问我。',
        ),
      ],
      planById: new Map([[activePlan.id, activePlan]]),
      planStatusById: new Map([[activePlan.id, activePlan.status]]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

test('enqueue_task(write) stays blocked when multiple semantic continuation targets exist but the draft rewrites to a new execution lane without fresh lane evidence', () => {
  const planA = createPlanFixture({
    id: 'plan-auth-guard-multi-lane-a',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-multi-lane-a',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-multi-lane-a',
        cwd: '/repo/auth-guard-a',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })
  const planB = createPlanFixture({
    id: 'plan-auth-guard-multi-lane-b',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-multi-lane-b',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-multi-lane-b',
        cwd: '/repo/auth-guard-b',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '继续推进 auth guard 主线',
          cwd: '/repo/billing',
          mode: 'write',
          use_worktree: true,
          goal: '继续推进 auth guard 主线并落地下一步实现',
          in_scope: ['只处理 auth guard 主线'],
          out_of_scope: [],
          done_when: ['下一步主线修改完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          '继续推进 auth guard 主线并落地下一步实现，只处理 auth guard 主线。',
        ),
      ],
      planById: new Map([
        [planA.id, planA],
        [planB.id, planB],
      ]),
      planStatusById: new Map([
        [planA.id, planA.status],
        [planB.id, planB.status],
      ]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

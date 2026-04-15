import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('enqueue_task(write) still requires fresh lane evidence when the anchored active plan is outside default focus', () => {
  const activePlan = createPlanFixture({
    id: 'plan-auth-guard-cross-focus-lane-shift',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-auth-guard',
    status: 'active',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-auth-guard-cross-focus',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-cross-focus-lane-shift',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-cross-focus-lane-shift',
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
          cwd: '/repo/auth-guard-next',
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
      planById: new Map([[activePlan.id, activePlan]]),
      planStatusById: new Map([[activePlan.id, activePlan.status]]),
      resultTaskIds: new Set(['task-finished-auth-guard-cross-focus']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

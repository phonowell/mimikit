import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('same lane + direct reference + unrelated draft stays blocked', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-auth-guard-unrelated-direct-ref',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-unrelated-direct-ref',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-unrelated-direct-ref',
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
          title: '重构 billing retry pipeline',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '重构 billing retry pipeline 并完成回归验证',
          in_scope: ['只处理 billing retry pipeline'],
          out_of_scope: [],
          done_when: ['billing retry pipeline 重构完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput(`继续沿着 ${currentPlan.id} 这条计划推进。`)],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      resultTaskIds: new Set(['task-finished']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

test('plan id direct reference requires exact match', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-auth-guard',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-plan-auth-guard',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-plan-auth-guard',
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
          title: '继续推进 auth guard 主线下一步实现',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
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
      inputs: [createUserInput('继续沿着 plan-auth-guard-2 这条计划推进。')],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      resultTaskIds: new Set(['task-finished']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

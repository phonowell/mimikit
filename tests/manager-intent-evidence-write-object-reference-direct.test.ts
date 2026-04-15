import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceUserInput as createUserInput,
} from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('enqueue_task(write) stays allowed when user directly references the only active plan and the next draft stays semantically aligned', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-auth-guard-semantic-direct-ref',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-semantic-direct-ref',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-semantic-direct-ref',
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
      inputs: [
        createUserInput(
          `继续沿着 ${currentPlan.id} 这条计划推进，直接往下做。`,
        ),
      ],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      resultTaskIds: new Set(['task-finished']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task(write) stays allowed when user directly references the only result task and the next draft stays semantically aligned', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-auth-guard-semantic-direct-ref',
    title: '收敛 auth guard 的主链',
    cwd: '/repo/auth-guard',
    focusId: 'focus-inbox',
    status: 'succeeded',
    resourceMode: 'write',
    contract: {
      goal: '收敛 auth guard 的主链并给出下一步落地方向',
      scope: '只处理 auth guard 主链',
      acceptance: ['给出主链收敛结果'],
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '收敛 auth guard 主链的下一步落地',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '收敛 auth guard 的主链并完成下一步落地方向',
          in_scope: ['只处理 auth guard 主链'],
          out_of_scope: [],
          done_when: ['给出主链收敛结果'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          `继续沿着 ${finishedTask.id} 这条任务主线推进，直接往下做。`,
        ),
      ],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      resultTaskIds: new Set([finishedTask.id]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

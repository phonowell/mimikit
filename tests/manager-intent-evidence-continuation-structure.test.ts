import { test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('enqueue_task stays blocked when a single active plan is the only current continuation target but user input is only generic continuation text', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-runtime-single-anchor-heavy-reword',
    title: '按整体方案推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-runtime-single-anchor-heavy-reword',
      taskContract: {
        goal: '按整体方案推进 auth guard 主线',
        scope: '只处理 auth guard 主线',
        acceptance: ['当前主线继续推进'],
      },
      taskTemplate: {
        title: '按整体方案推进 auth guard 主线',
        executionSpecId: 'spec-runtime-single-anchor-heavy-reword',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '补齐登录拦截剩余落地点',
          cwd: '/repo/auth-guard',
          mode: 'write',
          goal: '沿当前鉴权链路继续补实现并完成验收',
          in_scope: ['聚焦登录门禁后续落地'],
          out_of_scope: [],
          done_when: ['后续落地完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput('继续推进这一条线。')],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      taskById: new Map(),
      taskStatusById: new Map(),
      resultTaskIds: new Set(['task-finished']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'enqueue_task',
    error: 'action_execution_rejected',
    hintIncludes: ['授权'],
  })
})

test('enqueue_task stays blocked when a single result task is the only current continuation target but user input is only generic continuation text', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-auth-guard-structure-only',
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
          title: '补齐登录拦截剩余落地点',
          cwd: '/repo/auth-guard',
          mode: 'write',
          goal: '沿当前鉴权链路继续补实现并完成验收',
          in_scope: ['聚焦登录门禁后续落地'],
          out_of_scope: [],
          done_when: ['后续落地完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput('继续把这一条线做完。')],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      resultTaskIds: new Set([finishedTask.id]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'enqueue_task',
    error: 'action_execution_rejected',
    hintIncludes: ['授权'],
  })
})

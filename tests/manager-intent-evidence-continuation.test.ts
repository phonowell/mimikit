import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceUserInput as createUserInput,
} from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('enqueue_task(read) stays allowed when a single active plan is the only current continuation target', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-coarse-next-batch',
    title: '按整体方案粗粒度推进后续整改',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-coarse-next-batch',
      taskContract: {
        goal: '以粗粒度方式推进下一批未完成整改',
        scope: '优先按阶段推进更大闭环',
        acceptance: ['本轮粗粒度专题已完成'],
      },
      taskTemplate: {
        title: '按整体方案粗粒度推进下一批未完成整改',
        executionSpecId: 'spec-plan-coarse-next-batch',
        cwd: '/repo/mimikit',
        resourceMode: 'read',
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '按整体方案粗粒度推进下一批未完成整改',
          cwd: '/repo/mimikit',
          mode: 'read',
          use_worktree: false,
          goal: '以粗粒度方式推进下一批未完成整改',
          in_scope: ['优先按阶段推进更大闭环'],
          out_of_scope: [],
          done_when: ['本轮粗粒度专题已完成'],
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

  expect(feedback).toHaveLength(0)
})

test('enqueue_task(read) stays allowed when a single result task is the only current continuation target', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-auth-guard',
    title: '收敛 auth guard 的主链',
    cwd: '/repo/auth-guard',
    focusId: 'focus-inbox',
    status: 'succeeded',
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
          title: '继续收敛 auth guard 的下一步主链',
          cwd: '/repo/auth-guard',
          mode: 'read',
          use_worktree: false,
          goal: '继续收敛 auth guard 的下一步主链并落地代码修改',
          in_scope: ['延续 auth guard 主链'],
          out_of_scope: [],
          done_when: ['下一步主链落地完成'],
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

  expect(feedback).toHaveLength(0)
})

test('enqueue_task stays blocked when the single result task changes execution lane', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-auth-guard-unrelated',
    title: '收敛 auth guard 的主链',
    cwd: '/repo/auth-guard',
    focusId: 'focus-inbox',
    status: 'succeeded',
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
          title: '重写支付结算链路',
          cwd: '/repo/payments',
          mode: 'write',
          use_worktree: false,
          goal: '重写支付结算链路并补齐回归测试',
          in_scope: ['只处理 payment checkout'],
          out_of_scope: [],
          done_when: ['支付结算主链完成'],
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

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

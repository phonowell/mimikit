import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceTask } from './helpers/manager-intent-evidence.js'

test('enqueue_task stays allowed when it explicitly continues the single current result task with no fresh user input', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-auth-guard-result-only-anchor',
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
        continuation_of: {
          type: 'task',
          id: finishedTask.id,
        },
        task: {
          title: '核实 auth guard 遗留主链的下一步落地',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '基于当前 result anchor 继续 auth guard 主链的下一步落地与验证。',
          in_scope: ['继续当前 auth guard 主线'],
          out_of_scope: [],
          done_when: ['下一步主线修改完成'],
          context_refs: [],
          instructions: [],
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

  expect(feedback).toHaveLength(0)
})

test('enqueue_task stays blocked when result-only continuation_of points to a mismatched task anchor with no fresh user input', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-auth-guard-result-only-anchor-mismatch',
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
        continuation_of: {
          type: 'task',
          id: finishedTask.id,
        },
        task: {
          title: '继续重写支付结算链路',
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
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

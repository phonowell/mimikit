import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import {
  createIntentEvidenceTaskContext,
  createIntentEvidenceTask as createTask,
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('enqueue_task is blocked when only supplemental evidence suggests new work', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          title: 'Implement intent evidence guard',
          cwd: '/repo/mimikit',
          goal: 'Add an intent-evidence guard for manager high-risk actions',
          in_scope: 'Validation and feedback flow only',
          done_when_1: 'Guard blocks unsupported risky actions',
        },
      },
    ],
    {
      inputs: [createUserInput('先总结当前状态，不要开始新任务。')],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
  expect(feedback[0]?.hint).toContain('task_result')
})

test('enqueue_task stays allowed when current user input directly supports it', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          title: 'Implement intent evidence guard',
          cwd: '/repo/mimikit',
          goal: 'Implement intent evidence guard for manager high-risk actions',
          in_scope: 'Touch validation and feedback flow only',
          done_when_1: 'Guard blocks unsupported risky actions',
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          '请实现 intent evidence guard，只改 manager validation and feedback flow，并确保能拦住 unsupported risky actions。',
        ),
      ],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

test('mutate_task is blocked when user input does not identify the task', () => {
  const task = createTask()
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: task.id,
          op: 'cancel',
        },
      },
    ],
    createIntentEvidenceTaskContext(task, [createUserInput('先看看文档里怎么说。')]),
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'mutate_task',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过', task.id],
  })
})

test('mutate_task stays allowed when user explicitly references the task', () => {
  const task = createTask()
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: task.id,
          op: 'cancel',
        },
      },
    ],
    {
      inputs: [createUserInput(`请取消 ${task.id}，也就是 ${task.title}。`)],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

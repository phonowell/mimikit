import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import {
  createIntentEvidenceChoiceInput as createChoiceInput,
  createIntentEvidenceTask as createTask,
  createIntentEvidenceTaskContext,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('mutate_task resume stays allowed for matching resume choice effect', () => {
  const task = createTask({ status: 'paused' })
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: task.id,
          op: 'resume',
        },
      },
    ],
    {
      inputs: [
        createChoiceInput({
          text: 'Selected option "Resume" for "Continue this task?".',
          source: 'user',
          taskId: task.id,
        }),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

test('mutate_task resume with supplemental instruction stays blocked without direct user wording', () => {
  const task = createTask({ status: 'paused' })
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: task.id,
          op: 'resume',
          resume_instruction: '继续这个任务，但先只处理测试失败。',
        },
      },
    ],
    {
      inputs: [
        createChoiceInput({
          text: 'Selected option "Resume" for "Continue this task?".',
          source: 'timeout',
          taskId: task.id,
        }),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'mutate_task',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过'],
  })
})

test('mutate_task resume with supplemental instruction stays allowed when user states the instruction text', () => {
  const task = createTask({ status: 'paused' })
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: task.id,
          op: 'resume',
          resume_instruction: '继续这个任务，但先只处理测试失败。',
        },
      },
    ],
    {
      inputs: [
        {
          id: 'input-user-resume-instruction',
          role: 'user',
          text: '继续这个任务，但先只处理测试失败。',
          createdAt: '2026-03-24T00:00:00.000Z',
        },
        createChoiceInput({
          text: 'Selected option "Resume" for "Continue this task?".',
          source: 'user',
          taskId: task.id,
        }),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

test('mutate_task cancel stays blocked for resume-only choice effect', () => {
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
    createIntentEvidenceTaskContext(task, [
      createChoiceInput({
        text: 'Selected option "Resume" for "Continue this task?".',
        source: 'user',
        taskId: task.id,
      }),
    ]),
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'mutate_task',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过'],
  })
})

test('enqueue_task stays blocked when only timeout choice text suggests new work', () => {
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
        createChoiceInput({
          text: 'Selected option "Implement intent evidence guard" for "What should happen next?".',
          source: 'timeout',
        }),
      ],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
})

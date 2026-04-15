import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTaskContext,
  createIntentEvidenceTask as createTask,
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('task_control is blocked when user input does not identify the task', () => {
  const task = createTask()
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: [],
      },
    ],
    createIntentEvidenceTaskContext(task, [
      createUserInput('先看看文档里怎么说。'),
    ]),
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'task_control',
    error: 'action_execution_rejected',
    hintIncludes: ['授权', task.id],
  })
})

test('task_control stays allowed when user explicitly references the task', () => {
  const task = createTask()
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: [],
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

test('task_control stays blocked when user input only mentions weak runtime signals like branch or cwd basename', () => {
  const task = createTask({
    id: 'task-login-interceptor',
    title: 'Refactor login interceptor',
    cwd: '/repo/auth-guard',
    branch: 'task/auth-guard',
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: [],
      },
    ],
    {
      inputs: [
        createUserInput(
          '请取消 task/auth-guard 这个分支里的那项 auth-guard 任务。',
        ),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'task_control',
    error: 'action_execution_rejected',
    hintIncludes: ['授权', task.id],
  })
})

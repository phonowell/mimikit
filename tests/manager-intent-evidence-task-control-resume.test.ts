import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTask as createTask,
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('task_control resume stays allowed when the target is the only paused task in current focus even if user input is generic continuation text', () => {
  const task = createTask({
    id: 'task-paused-auth-guard-only',
    title: '继续收敛 auth guard 主链',
    status: 'paused',
    focusId: 'focus-inbox',
    cwd: '/repo/auth-guard',
    resourceMode: 'write',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'resume',
        instructions: [],
      },
    ],
    {
      inputs: [createUserInput('继续把这一条线做完。')],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('task_control resume stays allowed for the only paused task in current focus even when resume instructions are not restated verbatim in user input', () => {
  const task = createTask({
    id: 'task-paused-auth-guard-instructions',
    title: '继续收敛 auth guard 主链',
    status: 'paused',
    focusId: 'focus-inbox',
    cwd: '/repo/auth-guard',
    resourceMode: 'write',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'resume',
        instructions: ['继续沿着上一次 review 后的同一主链往下收敛。'],
      },
    ],
    {
      inputs: [createUserInput('继续把这一条线做完。')],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('task_control resume stays allowed for the only paused task in current focus during result-only follow-up with no fresh user input', () => {
  const task = createTask({
    id: 'task-paused-auth-guard-result-only',
    title: '继续收敛 auth guard 主链',
    status: 'paused',
    focusId: 'focus-inbox',
    cwd: '/repo/auth-guard',
    resourceMode: 'write',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'resume',
        instructions: ['继续沿着上一次 review 后的同一主链往下收敛。'],
      },
    ],
    {
      inputs: [],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      resultTaskIds: new Set([task.id]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('task_control resume stays blocked on generic continuation text when current focus has multiple paused tasks', () => {
  const taskA = createTask({
    id: 'task-paused-auth-guard-a',
    title: '继续收敛 auth guard 主链',
    status: 'paused',
    focusId: 'focus-inbox',
    cwd: '/repo/auth-guard',
    resourceMode: 'write',
  })
  const taskB = createTask({
    id: 'task-paused-auth-guard-b',
    title: '继续收敛 auth guard 支线',
    status: 'paused',
    focusId: 'focus-inbox',
    cwd: '/repo/auth-guard',
    resourceMode: 'write',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: taskA.id,
        action: 'resume',
        instructions: [],
      },
    ],
    {
      inputs: [createUserInput('继续把这一条线做完。')],
      taskStatusById: new Map([
        [taskA.id, taskA.status],
        [taskB.id, taskB.status],
      ]),
      taskById: new Map([
        [taskA.id, taskA],
        [taskB.id, taskB],
      ]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'task_control',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过', taskA.id],
  })
})

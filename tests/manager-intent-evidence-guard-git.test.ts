import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTaskContext,
  createIntentEvidenceTask as createTask,
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('record_task_git stays blocked when user only references task without explicit closure action', () => {
  const task = createTask({
    status: 'succeeded',
    git: {
      worktreePath: '/repo/auth-guard',
      branch: 'feature/auth-guard',
      lifecycle: {
        review: {
          passed: true,
        },
        merged: false,
        cleaned: false,
      },
    },
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'record_task_git',
        task_id: task.id,
        state: 'merged',
        source_input_id: 'input-user',
        source_quote: task.title,
      },
    ],
    createIntentEvidenceTaskContext(task, [
      createUserInput(`请看一下 ${task.id}，也就是 ${task.title}。`),
    ]),
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'record_task_git',
    hintIncludes: ['source_quote', '已合并到 main'],
  })
})

test('record_task_git requires current user input provenance fields', () => {
  const task = createTask({
    status: 'succeeded',
    git: {
      worktreePath: '/repo/auth-guard',
      branch: 'feature/auth-guard',
      lifecycle: {
        review: {
          passed: true,
        },
        merged: false,
        cleaned: false,
      },
    },
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'record_task_git',
        task_id: task.id,
        state: 'merged',
      },
    ],
    createIntentEvidenceTaskContext(task, [
      createUserInput(`请把 ${task.id} 标记为已合并到 main。`),
    ]),
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'record_task_git',
    error: 'invalid_action_args',
    hintIncludes: ['source_input_id', 'source_quote'],
  })
})

test('record_task_git stays allowed when current user input quote is anchored', () => {
  const task = createTask({
    status: 'succeeded',
    git: {
      worktreePath: '/repo/auth-guard',
      branch: 'feature/auth-guard',
      lifecycle: {
        review: {
          passed: true,
        },
        merged: false,
        cleaned: false,
      },
    },
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'record_task_git',
        task_id: task.id,
        state: 'merged',
        source_input_id: 'input-user',
        source_quote: '已合并到 main',
      },
    ],
    {
      inputs: [
        createUserInput(
          `请把 ${task.id} 标记为已合并到 main，也就是 ${task.title} 这条任务。`,
        ),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

test('record_task_git stays blocked when current user input only mentions closure action without task ref', () => {
  const task = createTask({
    status: 'succeeded',
    git: {
      worktreePath: '/repo/auth-guard',
      branch: 'feature/auth-guard',
      lifecycle: {
        review: {
          passed: true,
        },
        merged: false,
        cleaned: false,
      },
    },
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'record_task_git',
        task_id: task.id,
        state: 'merged',
        source_input_id: 'input-user',
        source_quote: '已合并到 main',
      },
    ],
    createIntentEvidenceTaskContext(task, [
      createUserInput('请标记为已合并到 main。'),
    ]),
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'record_task_git',
    hintIncludes: [task.id],
  })
})

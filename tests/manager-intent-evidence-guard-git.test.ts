import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import {
  createIntentEvidenceTaskContext,
  createIntentEvidenceTask as createTask,
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('mutate_task git closure stays blocked when user only references task without explicit closure action', () => {
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
    [{ name: 'mutate_task', attrs: { id: task.id, op: 'merged', reason: 'mark this task as merged to main' } }],
    createIntentEvidenceTaskContext(task, [
      createUserInput(`请看一下 ${task.id}，也就是 ${task.title}。`),
    ]),
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'mutate_task',
    hintIncludes: ['当前需要：merged'],
  })
})

test('mutate_task git closure stays allowed when user explicitly requests the closure action', () => {
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
    [{ name: 'mutate_task', attrs: { id: task.id, op: 'merged', reason: '把这个任务标记为已合并到 main' } }],
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

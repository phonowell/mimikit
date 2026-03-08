import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

test('enqueue_task requires goal/scope/acceptance_1 contract attrs', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'Do work',
        title: 'Task without contract',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('task contract')
})

test('enqueue_task accepts complete contract attrs', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          prompt: 'Do work',
          title: 'Task with contract',
          goal: 'Finish task',
          scope: 'Single deliverable',
          acceptance_1: 'Output exists',
        },
      },
    ],
    {
      enabledWorkerProviders: new Set(['codex']),
    },
  )

  expect(feedback).toHaveLength(0)
})


import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

test('enqueue_task requires goal/in_scope/done_when_1 contract attrs', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'Do work',
        title: 'Task without contract',
        cwd: '/tmp/task-without-contract',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('每项一句即可')
  expect(feedback[0]?.hint).toContain('怎样算完成')
})

test('enqueue_task accepts complete contract attrs', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          worker_prompt: 'Do work',
          title: 'Task with contract',
          cwd: '/tmp/task-with-contract',
          goal: 'Finish task',
          in_scope: 'Single deliverable',
          done_when_1: 'Output exists',
        },
      },
    ],
    {},
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task accepts branch attr with complete contract attrs', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          worker_prompt: 'Do work',
          title: 'Task with branch contract',
          cwd: '/tmp/task-with-branch',
          branch: 'feat/runtime-status',
          goal: 'Finish task',
          in_scope: 'Single deliverable',
          done_when_1: 'Output exists',
        },
      },
    ],
    {},
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task rejects legacy scope and acceptance aliases', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          title: 'Task with legacy aliases',
          cwd: '/tmp/task-with-legacy-contract',
          goal: 'Finish task',
          scope: 'Single deliverable',
          acceptance_1: 'Output exists',
        },
      },
    ],
    {},
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('scope')
})

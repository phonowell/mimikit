import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../../src/policy/manager/action-feedback-collect.js'

test('mutate_task rejects resume when task is pending', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: 'task-2',
          op: 'resume',
        },
      },
    ],
    {
      taskStatusById: new Map([['task-2', 'pending']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('mutate_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('无法 resume')
})

test('enqueue_task rejects unexpected provider attr', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          worker_prompt: 'run with free provider',
          title: 'use codex',
          cwd: '/tmp/use-codex',
          goal: 'Run worker task',
          in_scope: 'Single task',
          done_when_1: 'Produce output',
          provider: 'codex',
        },
      },
    ],
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('provider')
})

test('enqueue_task rejects missing task contract attrs', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'run task',
        title: 'missing contract',
        cwd: '/tmp/missing-contract',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('每项一句即可')
  expect(feedback[0]?.hint).toContain('补齐 contract 后重试')
})

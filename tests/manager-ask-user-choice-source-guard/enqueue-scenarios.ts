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
  expect(feedback[0]?.hint).toContain('worker_prompt=')
  expect(feedback[0]?.hint).toContain('out_of_scope=')
})

test('enqueue_task high-cost payload requires user confirmation first', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          worker_prompt: 'x'.repeat(1300),
          title: 'high-cost',
          cwd: '/tmp/high-cost-task',
          goal: 'Ship high-cost task',
          in_scope: 'All modules',
          done_when_1: 'A',
          done_when_2: 'B',
          done_when_3: 'C',
        },
      },
    ],
    {
      confirmedRunTaskChoiceIds: new Set(),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('高成本长任务')
})

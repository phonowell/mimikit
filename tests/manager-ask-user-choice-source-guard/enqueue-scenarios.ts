import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../../src/policy/manager/action-feedback-collect.js'

test('task_control rejects resume when task is pending', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: 'task-2',
        action: 'resume',
        instructions: [],
      },
    ],
    {
      taskStatusById: new Map([['task-2', 'pending']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('task_control')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('无法 resume')
})

test('enqueue_task rejects unexpected provider attr', () => {
  const feedback = collectManagerActionFeedback([
    {
      type: 'enqueue_task',
      task: {
        title: 'use codex',
        cwd: '/tmp/use-codex',
        mode: 'write',
        goal: 'Run worker task',
        in_scope: ['Single task'],
        out_of_scope: [],
        done_when: ['Produce output'],
        context_refs: [],
        instructions: [],
        provider: 'codex',
      },
    },
  ] as never)

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('provider')
})

test('enqueue_task rejects missing task contract attrs', () => {
  const feedback = collectManagerActionFeedback([
    {
      type: 'enqueue_task',
      task: {
        title: 'missing contract',
        cwd: '/tmp/missing-contract',
        mode: 'write',
        goal: '',
        in_scope: [],
        out_of_scope: [],
        done_when: [],
        context_refs: [],
        instructions: [],
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('done_when')
})

import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback.js'

test('collectManagerActionFeedback reports unregistered, invalid args, and rejected actions', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'read',
      attrs: {
        filePath: '/tmp/demo.txt',
        limit: '120',
      },
    },
    {
      name: 'create_task',
      attrs: {
        prompt: '',
        title: 'invalid',
        profile: 'standard',
      },
    },
    {
      name: 'create_task',
      attrs: {
        prompt: 'Read .mimikit/history/2026-02-15.jsonl',
        title: 'forbidden',
        profile: 'standard',
      },
    },
    {
      name: 'cancel_task',
      attrs: {
        id: 'missing-id',
      },
    },
    {
      name: 'cancel_task',
      attrs: {
        id: 'done-id',
      },
    },
    {
      name: 'query_history',
      attrs: {
        query: 'history',
        from: 'not-a-date',
      },
    },
  ], {
    taskStatusById: new Map([['done-id', 'succeeded']]),
  })

  expect(feedback).toHaveLength(6)
  expect(feedback[0]?.action).toBe('read')
  expect(feedback[0]?.error).toBe('unregistered_action')
  expect(feedback[0]?.attempted).toContain('<M:read')
  expect(feedback.some((item) => item.error === 'invalid_action_args')).toBe(
    true,
  )
  expect(
    feedback.some(
      (item) =>
        item.action === 'create_task' &&
        item.error === 'action_execution_rejected',
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'cancel_task' &&
        item.error === 'action_execution_rejected',
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'cancel_task' &&
        item.hint.includes('任务已完成'),
    ),
  ).toBe(true)
  expect(
    feedback.some(
      (item) =>
        item.action === 'query_history' &&
        item.error === 'invalid_action_args',
    ),
  ).toBe(true)
})

test('collectManagerActionFeedback ignores valid registered actions', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'create_task',
        attrs: {
          prompt: 'x',
          title: 'y',
          profile: 'standard',
        },
      },
      {
        name: 'summarize_task_result',
        attrs: {
          task_id: 't1',
          summary: 'ok',
        },
      },
      {
        name: 'cancel_task',
        attrs: {
          id: 't1',
        },
      },
      {
        name: 'query_history',
        attrs: {
          query: 'history',
        },
      },
    ],
    { taskStatusById: new Map([['t1', 'pending']]) },
  )

  expect(feedback).toHaveLength(0)
})

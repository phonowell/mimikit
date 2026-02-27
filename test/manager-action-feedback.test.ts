import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

test('collectManagerActionFeedback reports unregistered action', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'read',
      attrs: {
        filePath: '/tmp/demo.txt',
        limit: '120',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('read')
  expect(feedback[0]?.error).toBe('unregistered_action')
  expect(feedback[0]?.attempted).toContain('<M:read')
})

test('collectManagerActionFeedback reports invalid run_task args when prompt is empty', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'run_task',
      attrs: {
        prompt: '',
        title: 'invalid',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('collectManagerActionFeedback rejects schedule_task scheduled_at that is not in future', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'schedule_task',
        attrs: {
          prompt: 'schedule judged by env now',
          title: 'invalid by env now',
          scheduled_at: '2099-01-01T00:00:00.000Z',
        },
      },
    ],
    {
      scheduleNowIso: '2100-01-01T00:00:00.000Z',
    },
  )
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('scheduled_at 必须晚于当前时间')
})

test('collectManagerActionFeedback rejects cancel_task for missing task id', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'cancel_task',
      attrs: {
        id: 'missing-id',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('cancel_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
})

test('collectManagerActionFeedback rejects cancel_task for completed task', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'cancel_task',
        attrs: {
          id: 'done-id',
        },
      },
    ],
    {
      taskStatusById: new Map([['done-id', 'succeeded']]),
    },
  )
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('任务已完成')
})

test('collectManagerActionFeedback reports invalid query_history date args', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'query_history',
      attrs: {
        query: 'history',
        from: 'not-a-date',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('query_history')
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('collectManagerActionFeedback rejects compress_context when context is unavailable', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'compress_context',
      attrs: {},
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('compress_context')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('无可压缩上下文')
})

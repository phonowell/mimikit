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
  expect(feedback[0]?.hint).toContain('scheduled_at')
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
  expect(feedback[0]?.hint?.trim().length).toBeGreaterThan(0)
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

test('collectManagerActionFeedback reports invalid read_file args when path is empty', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'read_file',
      attrs: {
        path: '',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('read_file')
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
})

test('collectManagerActionFeedback reports malformed action tag when no action is parsed', () => {
  const output =
    '鎴戜細鎵ц\n<M:run_task title="demo" prompt="x" " />'
  const feedback = collectManagerActionFeedback([], {}, output)
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('run_task')
  expect(feedback[0]?.error).toBe('invalid_action_syntax')
  expect(feedback[0]?.attempted).toContain('<M:run_task')
})

test('collectManagerActionFeedback reports action tag inside code block when no action is parsed', () => {
  const output = [
    '```xml',
    '<M:run_task title="demo" prompt="x" />',
    '```',
  ].join('\n')
  const feedback = collectManagerActionFeedback([], {}, output)
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('run_task')
  expect(feedback[0]?.error).toBe('invalid_action_syntax')
  expect(feedback[0]?.hint?.trim().length).toBeGreaterThan(0)
})

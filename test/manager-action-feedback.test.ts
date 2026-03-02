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

test('collectManagerActionFeedback rejects create_plan scheduled_at that is not in future', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'create_plan',
        attrs: {
          prompt: 'schedule judged by env now',
          title: 'invalid by env now',
          trigger_mode: 'scheduled_at',
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

test('collectManagerActionFeedback allows update_plan last_task_id on done plan', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'update_plan',
        attrs: {
          id: 'plan-done',
          last_task_id: 'task-123',
        },
      },
    ],
    {
      planStatusById: new Map([['plan-done', 'done']]),
    },
  )
  expect(feedback).toHaveLength(0)
})

test('collectManagerActionFeedback rejects update_plan non-last_task patch on done plan', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'update_plan',
        attrs: {
          id: 'plan-done',
          title: 'new title',
        },
      },
    ],
    {
      planStatusById: new Map([['plan-done', 'done']]),
    },
  )
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('action_execution_rejected')
})

test('collectManagerActionFeedback reports invalid write_profile args when content is missing', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'write_profile',
      attrs: {
        target: 'user',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('write_profile')
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('collectManagerActionFeedback reports invalid write_profile args when content is blank', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'write_profile',
      attrs: {
        target: 'user',
        content: '   ',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('write_profile')
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

test('collectManagerActionFeedback reports malformed tag even when another action is valid', () => {
  const output = [
    '我会先执行一个任务。',
    '<M:run_task prompt="valid" title="valid" />',
    '<M:run_task title="broken" prompt="oops" " />',
  ].join('\n')
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'run_task',
        attrs: {
          prompt: 'valid',
          title: 'valid',
        },
      },
    ],
    {},
    output,
  )
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('invalid_action_syntax')
  expect(feedback[0]?.action).toBe('run_task')
})

test('collectManagerActionFeedback reports action markup outside trailing action zone', () => {
  const output = [
    '我先描述一下：<M:run_task prompt="outside" title="outside" />',
    '然后在末尾放真实 action',
    '<M:run_task prompt="tail" title="tail" />',
  ].join('\n')
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'run_task',
        attrs: {
          prompt: 'tail',
          title: 'tail',
        },
      },
    ],
    {},
    output,
  )
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.error).toBe('invalid_action_syntax')
  expect(feedback[0]?.attempted).toContain('outside')
})

test('collectManagerActionFeedback reports invalid read_file optional arg value', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'read_file',
      attrs: {
        path: 'README.md',
        max_lines: 'abc',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('read_file')
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('collectManagerActionFeedback reports invalid query_history roles value', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'query_history',
      attrs: {
        query: 'release',
        roles: 'user,invalid',
      },
    },
  ])
  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('query_history')
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

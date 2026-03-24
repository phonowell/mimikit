import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../../src/policy/manager/action-feedback-collect.js'

test('upsert_focus rejects json-shaped open_items payload', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-demo',
        open_items: '["a","b"]',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('upsert_focus')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('open_items')
})

test('upsert_focus rejects non-contiguous open_item indices', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-demo',
        open_item_1: 'a',
        open_item_3: 'b',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('upsert_focus')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('contiguously')
})

test('update_plan requires schedule_type when patching cron_expr/scheduled_at fields', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'update_plan',
        attrs: {
          id: 'plan-1',
          cron_expr: '*/5 * * * *',
        },
      },
    ],
    {
      planStatusById: new Map([['plan-1', 'active']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('update_plan')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('schedule_type')
})

test('mutate_task rejects pause when task is already paused', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: 'task-1',
          op: 'pause',
        },
      },
    ],
    {
      taskStatusById: new Map([['task-1', 'paused']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('mutate_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('paused')
})

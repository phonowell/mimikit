import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'
import { resolveManagerActionSurface } from '../src/manager/action-surface.js'

test('task_result wake profile only exposes lookup task and plan actions', () => {
  const surface = resolveManagerActionSurface('task_result')

  expect([...surface.actionNames].sort()).toEqual([
    'create_plan',
    'delete_plan',
    'enqueue_task',
    'mutate_task',
    'query_context',
    'read_file',
    'set_task_result_summary',
    'update_plan',
  ])
  expect(surface.actionNames.has('remember_memory')).toBe(false)
  expect(surface.actionNames.has('upsert_focus')).toBe(false)
  expect(surface.actionNames.has('ask_user_choice')).toBe(false)
})

test('collectManagerActionFeedback rejects registered action outside active surface', () => {
  const surface = resolveManagerActionSurface('task_result')
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'remember_memory',
        attrs: {
          content: 'Always keep replies terse',
        },
      },
    ],
    {
      wakeProfile: 'task_result',
      allowedActions: surface.actionNames,
    },
  )

  expect(feedback).toEqual([
    expect.objectContaining({
      action: 'remember_memory',
      error: 'action_execution_rejected',
      hint: expect.stringContaining('wake_profile=task_result'),
    }),
  ])
})

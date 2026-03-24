import { expect, test } from 'vitest'

import { resolveManagerActionSurface } from '../src/policy/manager/action-surface.js'

test('user_input wake profile keeps manager surface focused on task/plan/dialog/focus/memory only', () => {
  const surface = resolveManagerActionSurface('user_input')

  expect(surface.domains.map((item) => item.domain)).toEqual([
    'task',
    'plan',
    'dialog',
    'focus',
    'memory',
  ])
  expect(surface.actionNames.has('query_context')).toBe(false)
  expect(surface.actionNames.has('read_file')).toBe(false)
})

test('task_result, trigger, and capacity wake profiles exclude lookup actions', () => {
  for (const wakeProfile of ['task_result', 'trigger', 'capacity'] as const) {
    const surface = resolveManagerActionSurface(wakeProfile)
    expect(surface.domains.map((item) => item.domain)).toEqual([
      'task',
      'plan',
    ])
    expect(surface.actionNames.has('query_context')).toBe(false)
    expect(surface.actionNames.has('read_file')).toBe(false)
  }
})

test('task_result wake profile excludes follow-up task creation and control actions that need fresh user intent', () => {
  const surface = resolveManagerActionSurface('task_result')

  expect(surface.actionNames.has('enqueue_task')).toBe(false)
  expect(surface.actionNames.has('mutate_task')).toBe(false)
  expect(surface.actionNames.has('set_task_result_summary')).toBe(true)
})

test('trigger and capacity wake profiles keep enqueue_task but exclude dead-end task actions', () => {
  for (const wakeProfile of ['trigger', 'capacity'] as const) {
    const surface = resolveManagerActionSurface(wakeProfile)
    expect(surface.actionNames.has('enqueue_task')).toBe(true)
    expect(surface.actionNames.has('mutate_task')).toBe(false)
    expect(surface.actionNames.has('set_task_result_summary')).toBe(false)
  }
})

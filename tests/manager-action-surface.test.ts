import { expect, test } from 'vitest'

import { resolveManagerActionSurface } from '../src/manager/action-surface.js'

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

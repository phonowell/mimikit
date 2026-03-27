import { expect, test } from 'vitest'

import { resolveManagerActionSurface } from '../src/policy/manager/action-surface.js'

test('manager action surface is unified across rounds', () => {
  const surface = resolveManagerActionSurface()

  expect(surface.domains.map((item) => item.domain)).toEqual([
    'task',
    'plan',
    'dialog',
    'focus',
    'memory',
  ])
  expect(surface.actionNames.has('query_context')).toBe(false)
  expect(surface.actionNames.has('read_file')).toBe(false)
  expect(surface.actionNames.has('enqueue_task')).toBe(true)
  expect(surface.actionNames.has('task_control')).toBe(true)
  expect(surface.actionNames.has('record_task_git')).toBe(true)
  expect(surface.actionNames.has('set_plan')).toBe(true)
  expect(surface.actionNames.has('mutate_task')).toBe(false)
  expect(surface.actionNames.has('create_plan')).toBe(false)
  expect(surface.actionNames.has('update_plan')).toBe(false)
  expect(surface.actionNames.has('set_task_result_summary')).toBe(false)
  expect(surface.actionNames.has('restart_runtime')).toBe(false)
})

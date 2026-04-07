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
  expect(Array.from(surface.actionNames).sort()).toEqual([
    'assign_focus',
    'delete_plan',
    'enqueue_task',
    'remember_memory',
    'remember_project_profile',
    'set_plan',
    'task_control',
  ])
})

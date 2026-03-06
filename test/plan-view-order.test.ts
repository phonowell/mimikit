import { expect, test } from 'vitest'

import { sortTaskPlansForView } from '../src/orchestrator/read-model/plan-select.js'
import type { TaskPlan } from '../src/types/index.js'

const createPlan = (overrides: Partial<TaskPlan> = {}): TaskPlan => ({
  id: 'plan-1',
  prompt: 'summarize',
  title: 'summarize',
  focusId: 'focus-global',
  profile: 'worker',
  priority: 'normal',
  source: 'user_request',
  status: 'active',
  trigger: { mode: 'on_worker_slot_freed' },
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  runCount: 0,
  ...overrides,
})

test('sortTaskPlansForView sorts by status, changed time, priority, then id', () => {
  const plans: TaskPlan[] = [
    createPlan({
      id: 'plan-active-old-high',
      status: 'active',
      priority: 'high',
      updatedAt: '2026-03-01T00:01:00.000Z',
    }),
    createPlan({
      id: 'plan-active-new-normal',
      status: 'active',
      priority: 'normal',
      updatedAt: '2026-03-01T00:11:00.000Z',
    }),
    createPlan({
      id: 'plan-active-new-high',
      status: 'active',
      priority: 'high',
      updatedAt: '2026-03-01T00:11:00.000Z',
    }),
    createPlan({
      id: 'plan-blocked-new',
      status: 'blocked',
      priority: 'high',
      updatedAt: '2026-03-01T00:13:00.000Z',
    }),
    createPlan({
      id: 'plan-blocked-old',
      status: 'blocked',
      priority: 'low',
      updatedAt: '2026-03-01T00:02:00.000Z',
    }),
    createPlan({
      id: 'plan-done-new',
      status: 'done',
      priority: 'high',
      updatedAt: '2026-03-01T00:09:00.000Z',
      archivedAt: '2026-03-01T00:09:00.000Z',
    }),
  ]

  expect(sortTaskPlansForView(plans).map((item) => item.id)).toEqual([
    'plan-active-new-high',
    'plan-active-new-normal',
    'plan-active-old-high',
    'plan-blocked-new',
    'plan-blocked-old',
    'plan-done-new',
  ])
})

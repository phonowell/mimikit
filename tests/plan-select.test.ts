import { expect, test } from 'vitest'

import {
  selectRecentPlans,
  selectRecentTasks,
} from '../src/surface/read-model/plan-select.js'

import {
  createPlanFixture,
  createTaskFixture,
  GLOBAL_FOCUS_ID,
} from './helpers/runtime-snapshot.js'

test('selectRecentTasks prioritizes active workline tasks, then anchor, then same-workline history, then fillers', () => {
  const tasks = [
    createTaskFixture({
      id: 'task-active-focus',
      focusId: GLOBAL_FOCUS_ID,
      status: 'running',
      startedAt: '2026-03-31T10:00:00.000Z',
      createdAt: '2026-03-31T09:00:00.000Z',
    }),
    createTaskFixture({
      id: 'task-latest-result',
      focusId: 'focus-other',
      status: 'succeeded',
      completedAt: '2026-03-31T11:00:00.000Z',
      createdAt: '2026-03-31T08:00:00.000Z',
    }),
    createTaskFixture({
      id: 'task-focus-recent',
      focusId: GLOBAL_FOCUS_ID,
      status: 'failed',
      completedAt: '2026-03-31T10:30:00.000Z',
      createdAt: '2026-03-31T07:00:00.000Z',
    }),
    createTaskFixture({
      id: 'task-unrelated-newer',
      focusId: 'focus-third',
      status: 'succeeded',
      completedAt: '2026-03-31T12:00:00.000Z',
      createdAt: '2026-03-31T06:00:00.000Z',
    }),
  ]

  const selected = selectRecentTasks(tasks, {
    minCount: 4,
    maxCount: 4,
    workingFocusIds: [GLOBAL_FOCUS_ID],
    latestResultTaskId: 'task-latest-result',
  })

  expect(selected.map((task) => task.id)).toEqual([
    'task-active-focus',
    'task-latest-result',
    'task-focus-recent',
    'task-unrelated-newer',
  ])
})

test('selectRecentTasks falls back to recency only when there is no workline anchor', () => {
  const tasks = [
    createTaskFixture({
      id: 'task-a',
      focusId: 'focus-a',
      status: 'succeeded',
      completedAt: '2026-03-31T11:00:00.000Z',
    }),
    createTaskFixture({
      id: 'task-b',
      focusId: 'focus-b',
      status: 'succeeded',
      completedAt: '2026-03-31T12:00:00.000Z',
    }),
  ]

  const selected = selectRecentTasks(tasks, {
    minCount: 1,
    maxCount: 2,
  })

  expect(selected.map((task) => task.id)).toEqual(['task-b', 'task-a'])
})

test('selectRecentPlans prioritizes active workline plans, then anchor, then same-workline history, then fillers', () => {
  const plans = [
    createPlanFixture({
      id: 'plan-active-focus',
      focusId: GLOBAL_FOCUS_ID,
      status: 'active',
      updatedAt: '2026-03-31T10:00:00.000Z',
    }),
    createPlanFixture({
      id: 'plan-latest-result',
      focusId: 'focus-other',
      status: 'done',
      updatedAt: '2026-03-31T09:30:00.000Z',
      runtime: {
        runCount: 1,
        lastTaskId: 'task-latest-result',
        closedAt: '2026-03-31T09:30:00.000Z',
        doneReason: 'completed',
      },
    }),
    createPlanFixture({
      id: 'plan-focus-recent',
      focusId: GLOBAL_FOCUS_ID,
      status: 'done',
      updatedAt: '2026-03-31T09:00:00.000Z',
      runtime: {
        runCount: 1,
        closedAt: '2026-03-31T09:00:00.000Z',
        doneReason: 'completed',
      },
    }),
    createPlanFixture({
      id: 'plan-unrelated-newer',
      focusId: 'focus-third',
      status: 'done',
      updatedAt: '2026-03-31T12:00:00.000Z',
      runtime: {
        runCount: 1,
        closedAt: '2026-03-31T12:00:00.000Z',
        doneReason: 'completed',
      },
    }),
  ]

  const selected = selectRecentPlans(plans, {
    minCount: 4,
    maxCount: 4,
    workingFocusIds: [GLOBAL_FOCUS_ID],
    latestResultTaskId: 'task-latest-result',
  })

  expect(selected.map((plan) => plan.id)).toEqual([
    'plan-active-focus',
    'plan-latest-result',
    'plan-focus-recent',
    'plan-unrelated-newer',
  ])
})

test('selectRecentPlans falls back to recency only when there is no workline anchor', () => {
  const plans = [
    createPlanFixture({
      id: 'plan-a',
      focusId: 'focus-a',
      status: 'done',
      updatedAt: '2026-03-31T10:00:00.000Z',
      runtime: {
        runCount: 1,
        closedAt: '2026-03-31T10:00:00.000Z',
        doneReason: 'completed',
      },
    }),
    createPlanFixture({
      id: 'plan-b',
      focusId: 'focus-b',
      status: 'done',
      updatedAt: '2026-03-31T12:00:00.000Z',
      runtime: {
        runCount: 1,
        closedAt: '2026-03-31T12:00:00.000Z',
        doneReason: 'completed',
      },
    }),
  ]

  const selected = selectRecentPlans(plans, {
    minCount: 1,
    maxCount: 2,
  })

  expect(selected.map((plan) => plan.id)).toEqual(['plan-b', 'plan-a'])
})

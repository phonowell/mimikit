import { expect, test } from 'vitest'

import { buildTaskViews } from '../../src/surface/read-model/task-view.js'
import { createTaskFixture } from '../helpers/runtime-snapshot.js'

import type { Task } from '../../src/foundation/types/index.js'

test('buildTaskViews keeps task statuses', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-done',
      status: 'succeeded',
      completedAt: '2026-03-01T00:06:00.000Z',
    }),
    createTaskFixture({ id: 'task-failed', status: 'failed' }),
    createTaskFixture({ id: 'task-paused', status: 'paused' }),
    createTaskFixture({ id: 'task-running', status: 'running' }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  const statusById = new Map(views.map((item) => [item.id, item.status]))
  expect(statusById.get('task-done')).toBe('succeeded')
  expect(statusById.get('task-failed')).toBe('failed')
  expect(statusById.get('task-paused')).toBe('paused')
  expect(statusById.get('task-running')).toBe('running')
})

test('buildTaskViews includes task provider in view payload', () => {
  const tasks: Task[] = [createTaskFixture({ id: 'task-codex', provider: 'codex' })]
  const { tasks: views } = buildTaskViews(tasks)
  const providerById = new Map(views.map((item) => [item.id, item.provider]))
  expect(providerById.get('task-codex')).toBe('codex')
})

test('buildTaskViews marks pending reason as waiting_capacity when worker slots are full', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-running',
      status: 'running',
      cwd: '/tmp/runtime-snapshot-running',
    }),
    createTaskFixture({
      id: 'task-pending',
      status: 'pending',
      cwd: '/tmp/runtime-snapshot-pending',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks, 200, {
    maxConcurrentWorkers: 1,
    runningTaskCount: 1,
  })
  const pending = views.find((item) => item.id === 'task-pending')
  expect(pending?.pending_reason).toBe('waiting_capacity')
})

test('buildTaskViews omits pending reason when worker slots are available', () => {
  const tasks: Task[] = [createTaskFixture({ id: 'task-pending' })]
  const { tasks: views } = buildTaskViews(tasks, 200, {
    maxConcurrentWorkers: 2,
    runningTaskCount: 1,
  })
  expect(views[0]?.pending_reason).toBeUndefined()
})

test('buildTaskViews includes running live output snippet', () => {
  const tasks: Task[] = [
    createTaskFixture({ id: 'task-running', status: 'running' }),
    createTaskFixture({ id: 'task-pending', status: 'pending' }),
  ]
  const { tasks: views } = buildTaskViews(tasks, 200, {
    maxConcurrentWorkers: 2,
    runningTaskCount: 1,
    liveOutputByTaskId: new Map([['task-running', 'partial output']]),
  })
  const running = views.find((item) => item.id === 'task-running')
  const pending = views.find((item) => item.id === 'task-pending')
  expect(running?.liveOutput).toBe('partial output')
  expect(pending?.liveOutput).toBeUndefined()
})

test('buildTaskViews keeps paused task state without exposing extra UI state', () => {
  const task = createTaskFixture({
    id: 'task-user-paused',
    status: 'paused',
    pausedAt: '2026-03-01T00:05:50.000Z',
  })

  const { tasks: views } = buildTaskViews([task])
  expect(views[0]).toMatchObject({
    id: 'task-user-paused',
    status: 'paused',
  })
  expect(views[0]?.stopReason).toBeUndefined()
  expect(views[0]?.recoverable).toBeUndefined()
})

test('buildTaskViews sorts by status, change time, created time, then id', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-running-old',
      status: 'running',
      createdAt: '2026-03-01T00:01:00.000Z',
      startedAt: '2026-03-01T00:02:00.000Z',
    }),
    createTaskFixture({
      id: 'task-running-new',
      status: 'running',
      createdAt: '2026-03-01T00:03:00.000Z',
      startedAt: '2026-03-01T00:04:00.000Z',
    }),
    createTaskFixture({
      id: 'task-paused',
      status: 'paused',
      createdAt: '2026-03-01T00:02:20.000Z',
      pausedAt: '2026-03-01T00:05:50.000Z',
    }),
    createTaskFixture({
      id: 'task-pending-new',
      status: 'pending',
      createdAt: '2026-03-01T00:05:00.000Z',
    }),
    createTaskFixture({
      id: 'task-pending-old',
      status: 'pending',
      createdAt: '2026-03-01T00:01:00.000Z',
    }),
    createTaskFixture({
      id: 'task-failed',
      status: 'failed',
      createdAt: '2026-03-01T00:02:00.000Z',
      completedAt: '2026-03-01T00:06:00.000Z',
    }),
    createTaskFixture({
      id: 'task-succeeded',
      status: 'succeeded',
      createdAt: '2026-03-01T00:02:30.000Z',
      completedAt: '2026-03-01T00:07:00.000Z',
    }),
    createTaskFixture({
      id: 'task-canceled',
      status: 'canceled',
      createdAt: '2026-03-01T00:02:40.000Z',
      completedAt: '2026-03-01T00:08:00.000Z',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  expect(views.map((item) => item.id)).toEqual([
    'task-running-new',
    'task-running-old',
    'task-paused',
    'task-pending-new',
    'task-pending-old',
    'task-failed',
    'task-succeeded',
    'task-canceled',
  ])
})

test('buildTaskViews uses id as stable tie-breaker for same status and time', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-pending-b',
      status: 'pending',
      createdAt: '2026-03-01T00:05:00.000Z',
    }),
    createTaskFixture({
      id: 'task-pending-a',
      status: 'pending',
      createdAt: '2026-03-01T00:05:00.000Z',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  expect(views.map((item) => item.id)).toEqual([
    'task-pending-a',
    'task-pending-b',
  ])
})

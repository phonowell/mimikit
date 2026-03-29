import { expect, test } from 'vitest'

import { buildTaskViews } from '../src/surface/read-model/task-view.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'

import type { Task } from '../src/foundation/types/index.js'

test('buildTaskViews marks pending reason as waiting_dispatch_lock when lock key is occupied', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-running',
      status: 'running',
      cwd: '/tmp/repo-main',
      repoKey: '/tmp/repo/.git',
      branch: 'main',
    }),
    createTaskFixture({
      id: 'task-pending',
      status: 'pending',
      cwd: '/tmp/repo-main',
      repoKey: '/tmp/repo/.git',
      branch: 'main',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks, 200, {
    maxConcurrentWorkers: 4,
    runningTaskCount: 1,
  })
  expect(views.find((item) => item.id === 'task-pending')?.pending_reason).toBe(
    'waiting_dispatch_lock',
  )
  expect(
    views.find((item) => item.id === 'task-pending')?.dispatchLock,
  ).toEqual({
    blockerTaskId: 'task-running',
    lockKey: 'git:/tmp/repo/.git#main',
  })
})

test('buildTaskViews preserves succeeded status from task truth source', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-inconsistent-succeeded',
      status: 'succeeded',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  expect(views[0]?.status).toBe('succeeded')
})

test('buildTaskViews does not mark read task as waiting_dispatch_lock', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-running-write',
      status: 'running',
      resourceMode: 'write',
      cwd: '/tmp/repo-main',
      repoKey: '/tmp/repo/.git',
      branch: 'main',
    }),
    createTaskFixture({
      id: 'task-pending-read',
      status: 'pending',
      resourceMode: 'read',
      cwd: '/tmp/repo-main',
      repoKey: '/tmp/repo/.git',
      branch: 'main',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks, 200, {
    maxConcurrentWorkers: 4,
    runningTaskCount: 1,
  })
  const view = views.find((item) => item.id === 'task-pending-read')
  expect(view?.pending_reason).toBeUndefined()
  expect(view?.dispatchLock).toBeUndefined()
})

test('buildTaskViews exposes traceRef from task result', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-with-trace',
      status: 'failed',
      result: {
        taskId: 'task-with-trace',
        status: 'failed',
        ok: false,
        output: 'timeout',
        durationMs: 12,
        completedAt: '2026-02-06T00:00:12.000Z',
        traceRef: '.mimikit/traces/2026-02-06/trace-worker.txt',
      },
    }),
  ]

  const { tasks: views } = buildTaskViews(tasks)

  expect(views[0]?.traceRef).toBe('.mimikit/traces/2026-02-06/trace-worker.txt')
})

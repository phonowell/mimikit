import { expect, test } from 'vitest'

import { buildTaskViews } from '../src/orchestrator/read-model/task-view.js'
import { createTaskFixture } from './helpers/runtime-snapshot.js'
import type { Task } from '../src/types/index.js'

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
})

test('buildTaskViews downgrades succeeded status without completion markers', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-inconsistent-succeeded',
      status: 'succeeded',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  expect(views[0]?.status).toBe('pending')
})

import { expect, test } from 'vitest'

import { buildTaskViews } from '../src/supervisor/task-view.js'
import type { Task } from '../src/types/index.js'

const createTask = (params: {
  id: string
  createdAt: string
  archivePath?: string
  resultArchivePath?: string
}): Task => ({
  id: params.id,
  fingerprint: params.id,
  prompt: params.id,
  title: params.id,
  status: 'succeeded',
  createdAt: params.createdAt,
  ...(params.archivePath ? { archivePath: params.archivePath } : {}),
  ...(params.resultArchivePath
    ? {
        result: {
          taskId: params.id,
          status: 'succeeded',
          ok: true,
          output: 'done',
          durationMs: 1,
          completedAt: params.createdAt,
          archivePath: params.resultArchivePath,
        },
      }
    : {}),
})

test('buildTaskViews exposes archivePath from task', () => {
  const { tasks } = buildTaskViews([
    createTask({
      id: 't1',
      createdAt: '2026-02-06T00:00:00.000Z',
      archivePath: '.mimikit/tasks/2026-02-06/t1_task.md',
    }),
  ])
  expect(tasks[0]?.archivePath).toBe('.mimikit/tasks/2026-02-06/t1_task.md')
})

test('buildTaskViews falls back to result.archivePath', () => {
  const { tasks } = buildTaskViews([
    createTask({
      id: 't1',
      createdAt: '2026-02-06T00:00:00.000Z',
      resultArchivePath: '.mimikit/tasks/2026-02-06/t1_task.md',
    }),
  ])
  expect(tasks[0]?.archivePath).toBe('.mimikit/tasks/2026-02-06/t1_task.md')
})

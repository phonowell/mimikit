import { expect, test } from 'vitest'

import {
  enqueueTask,
  markTaskCanceled,
  markTaskRunning,
} from '../src/orchestrator/core/task-lifecycle.js'
import { buildTaskFingerprint } from '../src/orchestrator/core/task-state.js'
import type { Task } from '../src/types/index.js'

const createTask = (overrides?: Partial<Task>): Task => ({
  id: 'task-1',
  fingerprint: buildTaskFingerprint({
    prompt: 'Write report',
    title: 'Write report',
    profile: 'worker',
  }),
  prompt: 'Write report',
  title: 'Write report',
  focusId: 'focus-global',
  profile: 'worker',
  status: 'pending',
  createdAt: '2026-02-26T10:00:00.000Z',
  ...overrides,
})

test('enqueueTask returns existing active task by fingerprint', () => {
  const existing = createTask()
  const tasks: Task[] = [existing]

  const result = enqueueTask(tasks, 'Write report', 'Write report')

  expect(result).toMatchObject({ created: false, task: { id: existing.id } })
})

test('markTaskRunning sets running status with startedAt', () => {
  const tasks: Task[] = [createTask()]

  const updated = markTaskRunning(tasks, 'task-1')

  expect(updated).toMatchObject({ id: 'task-1', status: 'running' })
  expect(updated?.startedAt).toBeTypeOf('string')
})

test('markTaskCanceled keeps existing completedAt and durationMs values', () => {
  const tasks: Task[] = [
    createTask({
      status: 'running',
      completedAt: '2026-02-26T10:03:00.000Z',
      durationMs: 99,
    }),
  ]

  const updated = markTaskCanceled(tasks, 'task-1', {
    completedAt: '2026-02-26T10:09:00.000Z',
    durationMs: 300,
  })

  expect(updated).toMatchObject({
    id: 'task-1',
    status: 'canceled',
    completedAt: '2026-02-26T10:03:00.000Z',
    durationMs: 99,
  })
})

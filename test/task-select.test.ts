import { expect, test } from 'vitest'

import { selectRecentTasks } from '../src/orchestrator/task-select.js'
import type { Task } from '../src/types/index.js'

const createTask = (params: {
  id: string
  createdAt: string
  prompt?: string
  output?: string
}): Task => ({
  id: params.id,
  fingerprint: params.id,
  prompt: params.prompt ?? params.id,
  title: params.id,
  status: 'succeeded',
  createdAt: params.createdAt,
  completedAt: params.createdAt,
  ...(params.output
    ? {
        result: {
          taskId: params.id,
          status: 'succeeded',
          ok: true,
          output: params.output,
          durationMs: 10,
          completedAt: params.createdAt,
        },
      }
    : {}),
})

test('selectRecentTasks keeps newest within maxCount', () => {
  const tasks: Task[] = [
    createTask({ id: 't1', createdAt: '2026-01-01T00:00:00.000Z' }),
    createTask({ id: 't2', createdAt: '2026-01-02T00:00:00.000Z' }),
    createTask({ id: 't3', createdAt: '2026-01-03T00:00:00.000Z' }),
  ]
  const selected = selectRecentTasks(tasks, {
    minCount: 0,
    maxCount: 2,
    maxBytes: 0,
  })
  expect(selected.map((task) => task.id)).toEqual(['t3', 't2'])
})

test('selectRecentTasks enforces minCount before maxBytes stop', () => {
  const tasks: Task[] = [
    createTask({
      id: 't1',
      createdAt: '2026-01-01T00:00:00.000Z',
      output: 'x'.repeat(300),
    }),
    createTask({
      id: 't2',
      createdAt: '2026-01-02T00:00:00.000Z',
      output: 'x'.repeat(300),
    }),
    createTask({
      id: 't3',
      createdAt: '2026-01-03T00:00:00.000Z',
      output: 'x'.repeat(300),
    }),
  ]
  const selected = selectRecentTasks(tasks, {
    minCount: 2,
    maxCount: 5,
    maxBytes: 350,
  })
  expect(selected).toHaveLength(2)
  expect(selected.map((task) => task.id)).toEqual(['t3', 't2'])
})


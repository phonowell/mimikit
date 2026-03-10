import { expect, test } from 'vitest'

import {
  enqueueTask,
  markTaskCanceled,
  markTaskPaused,
  markTaskRunning,
} from '../src/orchestrator/core/task-lifecycle.js'
import { buildTaskFingerprint } from '../src/orchestrator/core/task-state.js'
import type { Task } from '../src/types/index.js'

const createTask = (overrides?: Partial<Task>): Task => ({
  id: 'task-1',
  fingerprint: buildTaskFingerprint({
    prompt: 'Write report',
    title: 'Write report',
    cwd: '/tmp/write-report',
    profile: 'worker',
    provider: 'codex',
  }),
  prompt: 'Write report',
  title: 'Write report',
  cwd: '/tmp/write-report',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'pending',
  createdAt: '2026-02-26T10:00:00.000Z',
  ...overrides,
})

test('enqueueTask returns existing active task by fingerprint', () => {
  const existing = createTask()
  const tasks: Task[] = [existing]

  const result = enqueueTask(
    tasks,
    'Write report',
    'Write report',
    '/tmp/write-report',
    'worker',
    'codex',
  )

  expect(result).toMatchObject({ created: false, task: { id: existing.id } })
})

test('enqueueTask does not dedupe when contract differs', () => {
  const tasks: Task[] = [
    createTask({
      contract: {
        goal: 'Goal A',
        scope: 'Scope A',
        acceptance: ['A1'],
      },
    }),
  ]

  const result = enqueueTask(
    tasks,
    'Write report',
    'Write report',
    '/tmp/write-report',
    'worker',
    'codex',
    undefined,
    'focus-global',
    undefined,
    undefined,
    {
      goal: 'Goal B',
      scope: 'Scope B',
      acceptance: ['B1'],
    },
  )

  expect(result.created).toBe(true)
  expect(tasks).toHaveLength(2)
  expect(result.task.contract?.goal).toBe('Goal B')
})

test('task status transitions keep expected timestamps', () => {
  const tasks: Task[] = [createTask()]

  const running = markTaskRunning(tasks, 'task-1')
  expect(running).toMatchObject({ id: 'task-1', status: 'running' })
  expect(running?.startedAt).toBeTypeOf('string')

  const paused = markTaskPaused(tasks, 'task-1')
  expect(paused).toMatchObject({ id: 'task-1', status: 'paused' })
  expect(paused?.pausedAt).toBeTypeOf('string')
  expect(paused?.startedAt).toBeUndefined()

  const task = tasks[0]
  if (!task) throw new Error('task fixture missing')
  task.completedAt = '2026-02-26T10:03:00.000Z'
  const canceled = markTaskCanceled(tasks, 'task-1', {
    completedAt: '2026-02-26T10:09:00.000Z',
  })

  expect(canceled).toMatchObject({
    id: 'task-1',
    status: 'canceled',
    completedAt: '2026-02-26T10:03:00.000Z',
  })
})

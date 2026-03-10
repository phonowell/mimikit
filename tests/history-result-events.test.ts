import { expect, test } from 'vitest'

import { appendConsumedResultsToHistory } from '../src/history/result-events.js'
import { readHistory } from '../src/history/store.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { Task, TaskResult } from '../src/types/index.js'

test('appendConsumedResultsToHistory ignores stale partial result after resume', async () => {
  const task: Task = {
    id: 'task-resumed',
    fingerprint: 'task-resumed',
    prompt: 'resume long task',
    title: 'Resume Long Task',
    focusId: 'focus-global',
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-03-10T00:00:00.000Z',
  }
  const result: TaskResult = {
    taskId: task.id,
    status: 'partial',
    taskStatus: 'paused',
    outcome: 'partial',
    stopReason: 'budget_exhausted',
    ok: false,
    output: 'partial draft',
    durationMs: 12,
    completedAt: '2026-03-10T00:00:12.000Z',
  }
  const runtime = await createTestRuntimeState({
    patch: {
      tasks: [task],
    },
  })

  const consumed = await appendConsumedResultsToHistory(
    runtime.paths.history,
    runtime.tasks,
    [result],
  )

  expect(consumed).toBe(1)
  expect(task.result).toBeUndefined()
  expect(await readHistory(runtime.paths.history)).toEqual([])
})

test('appendConsumedResultsToHistory ignores old partial result from previous pause cycle', async () => {
  const task: Task = {
    id: 'task-repaused',
    fingerprint: 'task-repaused',
    prompt: 'resume and pause again',
    title: 'Resume And Pause Again',
    focusId: 'focus-global',
    profile: 'worker',
    provider: 'codex',
    status: 'paused',
    createdAt: '2026-03-10T00:00:00.000Z',
    pausedAt: '2026-03-10T00:02:00.000Z',
  }
  const result: TaskResult = {
    taskId: task.id,
    status: 'partial',
    taskStatus: 'paused',
    outcome: 'partial',
    stopReason: 'budget_exhausted',
    ok: false,
    output: 'older partial draft',
    durationMs: 12,
    completedAt: '2026-03-10T00:01:00.000Z',
  }
  const runtime = await createTestRuntimeState({
    patch: {
      tasks: [task],
    },
  })

  const consumed = await appendConsumedResultsToHistory(
    runtime.paths.history,
    runtime.tasks,
    [result],
  )

  expect(consumed).toBe(1)
  expect(task.result).toBeUndefined()
  expect(await readHistory(runtime.paths.history)).toEqual([])
})

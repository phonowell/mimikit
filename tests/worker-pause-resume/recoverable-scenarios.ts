import { expect, test } from 'vitest'

import { requestTaskResumeChoice } from '../../src/work/orchestrator/task-resume-choice.js'
import { resumeRecoverableTasks } from '../../src/execution/worker/resume-task.js'

import { createQueueAdd, createRuntime, createTask } from './testkit.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

test('resumeRecoverableTasks requeues all budget-recoverable tasks only', async () => {
  const queueAdd = createQueueAdd()
  const runtime = await createRuntime({
    queue: {
      add: queueAdd as RuntimeState['worker']['queue']['add'],
      sizeBy: () => 0,
    },
  })
  const recoverableA = createTask('task-budget-a', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    result: {
      taskId: 'task-budget-a',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial a',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
    },
  })
  const recoverableB = createTask('task-budget-b', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:05.000Z',
    result: {
      taskId: 'task-budget-b',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial b',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:06.000Z',
    },
  })
  const manualPaused = createTask('task-manual-pause', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:07.000Z',
  })
  runtime.tasks = [recoverableA, recoverableB, manualPaused]

  const result = await resumeRecoverableTasks(runtime)

  expect(result).toMatchObject({
    ok: true,
    resumedCount: 2,
    skippedCount: 0,
  })
  expect(recoverableA.status).toBe('pending')
  expect(recoverableB.status).toBe('pending')
  expect(manualPaused.status).toBe('paused')
  expect(queueAdd).toHaveBeenCalledTimes(2)
})

test('budget pause appends a resume choice when another choice is pending', async () => {
  const runtime = await createRuntime()
  runtime.ui.pendingUserChoices = [
    {
      id: 'choice-existing',
      question: 'Choose output format',
      options: [
        { id: 'option-a', label: 'A', reason: 'reason-a' },
        { id: 'option-b', label: 'B', reason: 'reason-b' },
      ],
      defaultOptionId: 'option-a',
      createdAt: '2026-03-06T00:00:00.000Z',
      expiresAt: '2026-03-06T00:05:00.000Z',
      focusId: 'focus-global',
    },
  ]
  const task = createTask('task-budget-busy', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
  })

  const requested = await requestTaskResumeChoice({
    runtime,
    task,
    createdAt: '2026-03-06T00:00:04.000Z',
  })

  expect(requested).toBe(true)
  expect(runtime.ui.pendingUserChoices.map((item) => item.id)).toEqual([
    'choice-existing',
    'choice-task-resume-task-budget-busy',
  ])
})

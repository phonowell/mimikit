import { expect, test } from 'vitest'

import { readHistory } from '../../src/persistence/history/store.js'
import { pauseTask } from '../../src/execution/worker/pause-task.js'
import { resumeTask } from '../../src/execution/worker/resume-task.js'
import { requestTaskResumeChoice } from '../../src/work/orchestrator/task-resume-choice.js'
import { selectPendingUserChoiceFromUser } from '../../src/work/orchestrator/user-choice.js'

import { createQueueAdd, createRuntime, createTask } from './testkit.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

test('pauseTask marks pending task as paused and writes task_paused event', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-pause-pending')
  runtime.tasks = [task]

  const result = await pauseTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'paused',
  })
  expect(task.status).toBe('paused')
  expect(task.pausedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(runtime.ui.wakeVersion).toBe(1)
  const history = await readHistory(runtime.paths.history)
  const event = history
    .map((item) =>
      item.role === 'system'
        ? {
            name: item.systemEventName,
            payload: item.systemEventPayload,
          }
        : null,
    )
    .find((item) => item.name === 'task_paused')
  expect(event?.payload?.task_id).toBe(task.id)
})

test('pauseTask aborts running controller', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-pause-running', {
    status: 'running',
    startedAt: '2026-03-06T00:00:02.000Z',
  })
  runtime.tasks = [task]
  const controller = new AbortController()
  runtime.worker.runningControllers.set(task.id, controller)

  const result = await pauseTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'paused',
  })
  expect(controller.signal.aborted).toBe(true)
  expect(task.status).toBe('paused')
})

test('resumeTask re-queues paused task and writes task_resumed event', async () => {
  const queueAdd = createQueueAdd()
  const runtime = await createRuntime({
    queue: {
      add: queueAdd as RuntimeState['worker']['queue']['add'],
      sizeBy: () => 0,
    },
  })
  const task = createTask('task-resume', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    archivePath: '/tmp/task-partial.md',
    result: {
      taskId: 'task-resume',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
      archivePath: '/tmp/task-partial.md',
    },
  })
  runtime.tasks = [task]

  const result = await resumeTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'pending',
  })
  expect(task.status).toBe('pending')
  expect(task.pausedAt).toBeUndefined()
  expect(task.archivePath).toBeUndefined()
  expect(task.result).toBeUndefined()
  expect(queueAdd).toHaveBeenCalledTimes(1)
})

test('budget pause choice can resume paused partial task directly', async () => {
  const queueAdd = createQueueAdd()
  const runtime = await createRuntime({
    queue: {
      add: queueAdd as RuntimeState['worker']['queue']['add'],
      sizeBy: () => 0,
    },
  })
  const task = createTask('task-budget-resume', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    archivePath: '/tmp/task-budget-resume.md',
    result: {
      taskId: 'task-budget-resume',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
      archivePath: '/tmp/task-budget-resume.md',
    },
  })
  runtime.tasks = [task]

  const requested = await requestTaskResumeChoice({
    runtime,
    task,
  })

  expect(requested).toBe(true)
  expect(runtime.ui.pendingUserChoices[0]?.effect).toMatchObject({
    type: 'resume_task',
    taskId: task.id,
  })
  expect(runtime.ui.pendingUserChoices[0]?.expiresAt).toBeUndefined()

  const choice = runtime.ui.pendingUserChoices[0]
  if (!choice?.effect || choice.effect.type !== 'resume_task')
    throw new Error('expected resume_task choice')

  const result = await selectPendingUserChoiceFromUser(
    runtime,
    choice.id,
    choice.effect.optionId,
  )

  expect(result).toMatchObject({
    ok: true,
    choiceId: choice.id,
    optionId: choice.effect.optionId,
    source: 'user',
    effect: {
      type: 'resume_task',
      taskId: task.id,
      ok: true,
      status: 'pending',
    },
  })
  expect(runtime.ui.pendingUserChoices).toHaveLength(0)
  expect(task.status).toBe('pending')
  expect(task.result).toBeUndefined()
  expect(queueAdd).toHaveBeenCalledTimes(1)
})

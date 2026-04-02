import { expect, test } from 'vitest'

import { pauseTask } from '../../src/execution/worker/pause-task.js'
import { resumeTask } from '../../src/execution/worker/resume-task.js'
import { readHistory } from '../../src/persistence/history/store.js'

import { createQueueAdd, createRuntime, createTask } from './testkit.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

test('pauseTask marks pending task as paused and writes task_paused event', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-pause-pending')
  runtime.domain.tasks = [task]

  const result = await pauseTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'paused',
  })
  expect(task.status).toBe('paused')
  expect(task.pausedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(runtime.process.ui.wakeVersion).toBe(1)
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
  runtime.domain.tasks = [task]
  const controller = new AbortController()
  runtime.process.worker.runningControllers.set(task.id, controller)

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
      add: queueAdd as RuntimeState['process']['worker']['queue']['add'],
      sizeBy: () => 0,
    },
  })
  const task = createTask('task-resume', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    archivePath: '/tmp/task-paused.md',
  })
  runtime.domain.tasks = [task]

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

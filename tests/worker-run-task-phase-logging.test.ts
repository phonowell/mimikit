import { beforeEach, expect, test } from 'vitest'

import {
  appendLogMock,
  createRuntime,
  createTask,
  finalizeResultMock,
  prepareTask,
  resetRunTaskMocks,
  runTask,
  runTaskWithRetryMock,
  setBuildResultOk,
} from './worker-run-task-resume-instruction/testkit.js'

beforeEach(() => {
  resetRunTaskMocks()
})

test('runTask logs queue wait on worker_start when task already has startedAt', async () => {
  const runtime = await createRuntime()
  const task = await prepareTask(
    runtime,
    createTask('task-run-task-queue-wait', {
      startedAt: '2026-03-06T00:00:03.500Z',
    }),
  )

  setBuildResultOk(true)
  runTaskWithRetryMock.mockResolvedValue({
    output: 'done',
    elapsedMs: 1,
  })

  await runTask(runtime, task, new AbortController())

  expect(appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'worker_start',
      taskId: 'task-run-task-queue-wait',
      queueWaitMs: 3500,
    }),
  )
})

test('runTask appends worker_finalize timing after result write completes', async () => {
  const runtime = await createRuntime()
  const task = await prepareTask(
    runtime,
    createTask('task-run-task-finalize-log'),
  )

  setBuildResultOk(true)
  runTaskWithRetryMock.mockResolvedValue({
    output: 'done',
    elapsedMs: 1,
  })
  finalizeResultMock.mockResolvedValue(undefined)

  await runTask(runtime, task, new AbortController())

  expect(appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'worker_finalize',
      taskId: 'task-run-task-finalize-log',
      status: 'succeeded',
      elapsedMs: expect.any(Number),
      totalElapsedMs: expect.any(Number),
    }),
  )
})

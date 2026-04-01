import { beforeEach, expect, test } from 'vitest'

import { readTaskProgressForTest } from './helpers/task-progress.js'
import {
  buildResultMock,
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

test('runTask fails the task when the worker run ends without structured output', async () => {
  const runtime = await createRuntime()
  const task = await prepareTask(
    runtime,
    createTask('task-run-task-incomplete', {
      usage: { input: 120, output: 40, total: 160 },
    }),
  )

  setBuildResultOk(false)
  runTaskWithRetryMock.mockRejectedValue(new Error('missing structured result'))

  await runTask(runtime, task, new AbortController())

  expect(finalizeResultMock).toHaveBeenCalledTimes(1)
  expect(buildResultMock).toHaveBeenLastCalledWith(
    task,
    'failed',
    'missing structured result',
    expect.any(Number),
    { input: 120, output: 40, total: 160 },
    undefined,
    undefined,
  )
})

test('runTask persists partial worker activity into task-progress', async () => {
  const runtime = await createRuntime()
  const task = await prepareTask(
    runtime,
    createTask('task-run-task-progress', {
      status: 'running',
    }),
  )

  setBuildResultOk(true)
  runTaskWithRetryMock.mockImplementationOnce(
    ({ onPartialOutput }: { onPartialOutput?: (output: string) => void }) => {
      onPartialOutput?.('$ rg -n "worker_activity" src')
      onPartialOutput?.('tool completed: fs/read_file')
      return Promise.resolve({
        output: 'done',
        elapsedMs: 1,
      })
    },
  )

  await runTask(runtime, task, new AbortController())

  const progress = await readTaskProgressForTest(
    runtime.config.workDir,
    task.id,
  )
  expect(progress).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        taskId: task.id,
        type: 'worker_activity',
        payload: { text: '$ rg -n "worker_activity" src' },
      }),
      expect.objectContaining({
        taskId: task.id,
        type: 'worker_activity',
        payload: { text: 'tool completed: fs/read_file' },
      }),
      expect.objectContaining({
        taskId: task.id,
        type: 'worker_live_output',
        payload: { text: 'running command: rg -n "worker_activity" src' },
      }),
      expect.objectContaining({
        taskId: task.id,
        type: 'worker_live_output',
        payload: { text: 'tool completed: fs/read_file' },
      }),
    ]),
  )
})

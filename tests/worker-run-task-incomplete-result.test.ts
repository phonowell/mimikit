import { beforeEach, expect, test } from 'vitest'

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

test('runTask fails the task when the worker run ends without completion protocol', async () => {
  const runtime = await createRuntime()
  const task = await prepareTask(
    runtime,
    createTask('task-run-task-incomplete', {
      usage: { input: 120, output: 40, total: 160 },
    }),
  )

  setBuildResultOk(false)
  runTaskWithRetryMock.mockRejectedValue(
    new Error('missing completion protocol'),
  )

  await runTask(runtime, task, new AbortController())

  expect(finalizeResultMock).toHaveBeenCalledTimes(1)
  expect(buildResultMock).toHaveBeenLastCalledWith(
    task,
    'failed',
    'missing completion protocol',
    expect.any(Number),
    { input: 120, output: 40, total: 160 },
  )
})

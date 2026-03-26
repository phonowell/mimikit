import { beforeEach, expect, test } from 'vitest'

import {
  createResumeTask,
  createRuntime,
  finalizeResultMock,
  resetRunTaskMocks,
  resumeInstruction,
  runTask,
  runTaskWithRetryMock,
  setBuildResultOk,
} from './worker-run-task-resume-instruction/testkit.js'

beforeEach(() => {
  resetRunTaskMocks()
})

test('runTask consumes pending resume instruction after starting the resumed run', async () => {
  const runtime = await createRuntime()
  const task = await createResumeTask(
    runtime,
    'task-run-task-resume-instruction',
  )

  setBuildResultOk(true)
  runTaskWithRetryMock.mockResolvedValue({
    output: 'done',
    elapsedMs: 1,
  })

  await runTask(runtime, task, new AbortController())

  expect(runTaskWithRetryMock).toHaveBeenCalledTimes(1)
  expect(task.resumeInstruction).toBeUndefined()
  expect(finalizeResultMock).toHaveBeenCalledTimes(1)
})

test('runTask keeps pending resume instruction when the resumed run fails before execution starts', async () => {
  const runtime = await createRuntime()
  const task = await createResumeTask(
    runtime,
    'task-run-task-resume-instruction-failure',
  )

  setBuildResultOk(false)
  runTaskWithRetryMock.mockRejectedValue(new Error('codex provider disabled'))

  await runTask(runtime, task, new AbortController())

  expect(runTaskWithRetryMock).toHaveBeenCalledTimes(1)
  expect(task.resumeInstruction).toBe(resumeInstruction)
  expect(finalizeResultMock).toHaveBeenCalledTimes(1)
})

test('runTask clears pending resume instruction after the resumed turn has started and then fails', async () => {
  const runtime = await createRuntime()
  const task = await createResumeTask(
    runtime,
    'task-run-task-resume-instruction-started-failure',
  )

  setBuildResultOk(false)
  runTaskWithRetryMock.mockImplementationOnce(
    ({ onTurnStarted }: { onTurnStarted?: () => void }) => {
      onTurnStarted?.()
      return Promise.reject(new Error('codex stream interrupted'))
    },
  )

  await runTask(runtime, task, new AbortController())

  expect(runTaskWithRetryMock).toHaveBeenCalledTimes(1)
  expect(task.resumeInstruction).toBeUndefined()
  expect(finalizeResultMock).toHaveBeenCalledTimes(1)
})

test('runTask clears pending resume instruction when the resumed turn has started before a pause', async () => {
  const runtime = await createRuntime()
  const task = await createResumeTask(
    runtime,
    'task-run-task-resume-instruction-paused',
  )

  runTaskWithRetryMock.mockImplementationOnce(
    ({ onTurnStarted }: { onTurnStarted?: () => void }) => {
      onTurnStarted?.()
      task.status = 'paused'
      return Promise.reject(new Error('Task paused'))
    },
  )

  await runTask(runtime, task, new AbortController())

  expect(runTaskWithRetryMock).toHaveBeenCalledTimes(1)
  expect(task.resumeInstruction).toBeUndefined()
  expect(finalizeResultMock).not.toHaveBeenCalled()
})

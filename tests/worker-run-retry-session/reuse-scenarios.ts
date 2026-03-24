import { expect, test } from 'vitest'

import { ProviderError } from '../../src/execution/providers/provider-error.js'
import { runTaskWithRetry } from '../../src/execution/worker/run-retry.js'

import { createRuntime, createTask, expectDiscardedSession, runWorkerMock } from './testkit.js'

import type { WorkerLlmResult } from '../../src/execution/worker/run-retry.js'

test('runTaskWithRetry reuses persisted session id on next attempt', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-reuse', {
    sessionId: 'session-existing',
    sessionState: 'reusable',
  })

  runWorkerMock.mockResolvedValue({
    output: 'done',
    elapsedMs: 1,
  } satisfies WorkerLlmResult)

  await runTaskWithRetry({
    runtime,
    task,
    controller: new AbortController(),
  })

  expect(runWorkerMock).toHaveBeenCalledTimes(1)
  expect(runWorkerMock.mock.calls[0]?.[0]?.sessionId).toBe('session-existing')
})

test('runTaskWithRetry discards invalid session and retries without thread reuse', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.retry.maxAttempts = 1
  const task = createTask('task-reset-session', {
    sessionId: 'session-stale',
    sessionState: 'reusable',
  })

  runWorkerMock
    .mockRejectedValueOnce(new Error('thread not found while resume'))
    .mockResolvedValueOnce({
      output: 'done after reset',
      elapsedMs: 2,
    } satisfies WorkerLlmResult)

  const result = await runTaskWithRetry({
    runtime,
    task,
    controller: new AbortController(),
  })

  expect(result.output).toBe('done after reset')
  expectDiscardedSession({ task, firstSessionId: 'session-stale' })
})

test('runTaskWithRetry persists newly reported session id even when attempt fails', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-bind-session')

  runWorkerMock.mockImplementationOnce(
    async ({
      onSessionId,
    }: {
      onSessionId?: (sessionId: string) => Promise<void>
    }) => {
      await onSessionId?.('session-from-attempt')
      throw new Error('temporary failure')
    },
  )

  await expect(
    runTaskWithRetry({
      runtime,
      task,
      controller: new AbortController(),
    }),
  ).rejects.toThrow('temporary failure')

  expect(task.sessionId).toBe('session-from-attempt')
  expect(task.sessionState).toBe('reusable')
})

import { expect, test } from 'vitest'

import { ProviderError } from '../../src/execution/providers/provider-error.js'
import { runTaskWithRetry } from '../../src/execution/worker/run-retry.js'

import {
  appendLogMock,
  createRuntime,
  createTask,
  expectDiscardedSession,
  runWorkerMock,
} from './testkit.js'

import type { WorkerLlmResult } from '../../src/execution/worker/run-retry.js'

test('runTaskWithRetry discards reusable session after transient stream disconnect', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.retry.maxAttempts = 1
  const task = createTask('task-reset-transient-session', {
    sessionId: 'session-reconnect',
    sessionState: 'reusable',
  })

  runWorkerMock
    .mockRejectedValueOnce(
      new ProviderError({
        code: 'provider_transient_network',
        message:
          '[provider:codex-sdk] sdk run failed: Reconnecting... 1/5 (stream disconnected before completion)',
        retryable: true,
      }),
    )
    .mockResolvedValueOnce({
      output: 'done after fresh session',
      elapsedMs: 2,
    } satisfies WorkerLlmResult)

  const result = await runTaskWithRetry({
    runtime,
    task,
    controller: new AbortController(),
  })

  expect(result.output).toBe('done after fresh session')
  expectDiscardedSession({ task, firstSessionId: 'session-reconnect' })
})

test('runTaskWithRetry retries transient reconnect provider errors', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.retry.maxAttempts = 1
  const task = createTask('task-retry-provider-transient')

  runWorkerMock
    .mockRejectedValueOnce(
      new ProviderError({
        code: 'provider_transient_network',
        message:
          '[provider:codex-sdk] sdk run failed: Reconnecting... 1/5 (stream disconnected, waiting 174ms)',
        retryable: true,
      }),
    )
    .mockResolvedValueOnce({
      output: 'done after retry',
      elapsedMs: 2,
    } satisfies WorkerLlmResult)

  const result = await runTaskWithRetry({
    runtime,
    task,
    controller: new AbortController(),
  })

  expect(result.output).toBe('done after retry')
  expect(runWorkerMock).toHaveBeenCalledTimes(2)
  expect(
    appendLogMock.mock.calls.some((call) => call[1]?.event === 'worker_retry'),
  ).toBe(true)
  expect(task.attempts ?? 0).toBe(1)
})

test('runTaskWithRetry does not retry non-retryable provider errors', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.retry.maxAttempts = 2
  const task = createTask('task-no-retry-provider-error')

  runWorkerMock.mockRejectedValue(
    new ProviderError({
      code: 'provider_sdk_failure',
      message: '[provider:codex-sdk] sdk run failed: invalid schema',
      retryable: false,
    }),
  )

  await expect(
    runTaskWithRetry({
      runtime,
      task,
      controller: new AbortController(),
    }),
  ).rejects.toThrow('invalid schema')

  expect(runWorkerMock).toHaveBeenCalledTimes(1)
  expect(
    appendLogMock.mock.calls.some((call) => call[1]?.event === 'worker_retry'),
  ).toBe(false)
  expect(task.attempts ?? 0).toBe(0)
})

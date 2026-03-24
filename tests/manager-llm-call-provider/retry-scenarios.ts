import { expect, test } from 'vitest'

import { ProviderError } from '../../src/execution/providers/provider-error.js'
import {
  readManagerAutoRetryMeta,
  runManagerLlmCall,
} from '../../src/policy/manager/manager-llm-call.js'

import { runWithProviderMock } from './testkit.js'

test('manager retries retryable provider errors with worker-aligned retry config', async () => {
  runWithProviderMock
    .mockRejectedValueOnce(
      new ProviderError({
        code: 'provider_transient_network',
        message: '[provider:openai-responses] sdk run failed: fetch failed',
        retryable: true,
      }),
    )
    .mockResolvedValueOnce({
      output: 'ok after retry',
      elapsedMs: 9,
    })

  const result = await runManagerLlmCall({
    prompt: 'ping',
    workDir: '/tmp/mimikit',
    retry: {
      maxAttempts: 1,
      backoffMs: 0,
    },
  })

  expect(result.output).toBe('ok after retry')
  expect(runWithProviderMock).toHaveBeenCalledTimes(2)
})

test('manager annotates exhausted retryable failures with retry metadata', async () => {
  runWithProviderMock.mockRejectedValue(
    new ProviderError({
      code: 'provider_transient_network',
      message: '[provider:openai-responses] sdk run failed: fetch failed',
      retryable: true,
    }),
  )

  let caught: unknown
  try {
    await runManagerLlmCall({
      prompt: 'ping',
      workDir: '/tmp/mimikit',
      retry: {
        maxAttempts: 1,
        backoffMs: 0,
      },
    })
  } catch (error) {
    caught = error
  }

  expect(runWithProviderMock).toHaveBeenCalledTimes(2)
  expect(readManagerAutoRetryMeta(caught)).toEqual({
    autoRetryAttempts: 1,
    autoRetryMaxAttempts: 1,
    autoRetryState: 'exhausted',
    autoRetryStrategy: 'reuse_worker_retry_config',
  })
})

test('manager does not retry non-retryable provider errors', async () => {
  runWithProviderMock.mockRejectedValue(
    new ProviderError({
      code: 'provider_sdk_failure',
      message: '[provider:openai-responses] sdk run failed: bad request',
      retryable: false,
    }),
  )

  let caught: unknown
  try {
    await runManagerLlmCall({
      prompt: 'ping',
      workDir: '/tmp/mimikit',
      retry: {
        maxAttempts: 1,
        backoffMs: 0,
      },
    })
  } catch (error) {
    caught = error
  }

  expect(runWithProviderMock).toHaveBeenCalledTimes(1)
  expect(readManagerAutoRetryMeta(caught)).toEqual({
    autoRetryAttempts: 0,
    autoRetryMaxAttempts: 1,
    autoRetryState: 'not_retryable',
    autoRetryStrategy: 'reuse_worker_retry_config',
  })
})

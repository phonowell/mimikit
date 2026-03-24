import { beforeEach, expect, test, vi } from 'vitest'

import {
  readManagerAutoRetryMeta,
  runManagerLlmCall,
} from '../src/policy/manager/manager-llm-call.js'
import { ProviderError } from '../src/execution/providers/provider-error.js'

const { runWithProviderMock } = vi.hoisted(() => ({
  runWithProviderMock: vi.fn(),
}))

vi.mock('../src/execution/providers/registry.js', () => ({
  runWithProvider: runWithProviderMock,
}))

beforeEach(() => {
  runWithProviderMock.mockReset()
  runWithProviderMock.mockResolvedValue({
    output: 'ok',
    elapsedMs: 5,
  })
})

test('manager defaults to openai-responses', async () => {
  await runManagerLlmCall({
    prompt: 'ping',
    workDir: '/tmp/mimikit',
  })

  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'openai-responses',
      role: 'manager',
    }),
  )
})

test('manager forwards trimmed model to openai-responses', async () => {
  await runManagerLlmCall({
    prompt: 'ping',
    workDir: '/tmp/mimikit',
    model: ' gpt-5 ',
  })

  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'openai-responses',
      role: 'manager',
      model: 'gpt-5',
    }),
  )
})

test('manager forwards provider overrides to openai-responses', async () => {
  await runManagerLlmCall({
    prompt: 'ping',
    workDir: '/tmp/mimikit',
    baseUrl: ' http://localhost:18080/v1/codex/ ',
    apiKey: ' manager-config-key ',
    modelReasoningEffort: 'high',
  })

  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'openai-responses',
      role: 'manager',
      baseUrl: 'http://localhost:18080/v1/codex/',
      apiKey: 'manager-config-key',
      modelReasoningEffort: 'high',
    }),
  )
})

test('manager forwards promptSegments to openai-responses', async () => {
  await runManagerLlmCall({
    prompt: 'full prompt',
    promptSegments: [
      { text: 'stable prefix', cacheControl: 'ephemeral' },
      { text: 'variable suffix' },
    ],
    workDir: '/tmp/mimikit',
  })

  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'openai-responses',
      role: 'manager',
      prompt: 'full prompt',
      promptSegments: [
        { text: 'stable prefix', cacheControl: 'ephemeral' },
        { text: 'variable suffix' },
      ],
    }),
  )
})

test('manager forwards provider call logging metadata', async () => {
  await runManagerLlmCall({
    prompt: 'full prompt',
    promptSegments: [
      { text: 'stable prefix', cacheControl: 'ephemeral' },
      { text: 'variable suffix' },
    ],
    workDir: '/tmp/mimikit',
    logPath: '/tmp/mimikit/log.jsonl',
    logContext: {
      event: 'llm_call',
      role: 'manager',
      promptPrefixHash: 'prefix-hash',
      promptSegmentCount: 2,
      promptSegmentCacheControl: ['ephemeral', 'none'],
    },
  })

  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'openai-responses',
      role: 'manager',
      logPath: '/tmp/mimikit/log.jsonl',
      logContext: expect.objectContaining({
        event: 'llm_call',
        role: 'manager',
        promptPrefixHash: 'prefix-hash',
        promptSegmentCount: 2,
        promptSegmentCacheControl: ['ephemeral', 'none'],
      }),
    }),
  )
})

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

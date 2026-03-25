import { expect, test } from 'vitest'

import { runManagerLlmCall } from '../../src/policy/manager/manager-llm-call.js'

import { runWithProviderMock } from './testkit.js'

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
        promptSegmentCount: 2,
        promptSegmentCacheControl: ['ephemeral', 'none'],
      }),
    }),
  )
})

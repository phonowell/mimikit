import { beforeEach, expect, test, vi } from 'vitest'

import { runManagerLlmCall } from '../src/manager/manager-llm-call.js'

const { runWithProviderMock } = vi.hoisted(() => ({
  runWithProviderMock: vi.fn(),
}))

vi.mock('../src/providers/registry.js', () => ({
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
    managerProvider: {
      baseUrl: ' http://localhost:18080/v1/codex/ ',
      apiKey: ' manager-config-key ',
      modelReasoningEffort: 'high',
    },
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

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

test('manager mode auto defaults to openai-chat', async () => {
  await runManagerLlmCall({
    prompt: 'ping',
    workDir: '/tmp/mimikit',
  })

  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'openai-chat',
      role: 'manager',
    }),
  )
})

test('manager mode chat routes to openai-chat', async () => {
  await runManagerLlmCall({
    prompt: 'ping',
    workDir: '/tmp/mimikit',
    mode: 'chat',
  })

  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'openai-chat',
      role: 'manager',
    }),
  )
})

test('manager mode responses routes to codex-sdk', async () => {
  await runManagerLlmCall({
    prompt: 'ping',
    workDir: '/tmp/mimikit',
    mode: 'responses',
  })

  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'codex-sdk',
      role: 'manager',
    }),
  )
})

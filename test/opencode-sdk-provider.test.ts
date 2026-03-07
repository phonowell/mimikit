import { beforeEach, expect, test, vi } from 'vitest'

import { opencodeSdkProvider } from '../src/providers/opencode-sdk-provider.js'
import { readProviderErrorCode } from '../src/providers/provider-error.js'

const { createOpencodeClientMock, createOpencodeServerMock } = vi.hoisted(() => ({
  createOpencodeClientMock: vi.fn(),
  createOpencodeServerMock: vi.fn(),
}))

vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: createOpencodeClientMock,
  createOpencodeServer: createOpencodeServerMock,
}))

beforeEach(() => {
  createOpencodeClientMock.mockReset()
  createOpencodeServerMock.mockReset()
})

test('opencode provider surfaces server start error without secondary finally crash', async () => {
  createOpencodeServerMock.mockRejectedValueOnce(new Error('boot failed'))

  let caught: unknown
  try {
    await opencodeSdkProvider.run({
      provider: 'opencode-sdk',
      role: 'worker',
      prompt: 'ping',
      workDir: '/tmp/mimikit-opencode-provider',
      timeoutMs: 5000,
      model: 'big-pickle',
    })
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(Error)
  expect((caught as Error).message).toContain('boot failed')
  expect((caught as Error).message).not.toContain('shared')
  expect(readProviderErrorCode(caught)).toBe('provider_sdk_failure')
})


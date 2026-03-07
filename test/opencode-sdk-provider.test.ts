import { EventEmitter } from 'node:events'

import { beforeEach, expect, test, vi } from 'vitest'

import { opencodeSdkProvider } from '../src/providers/opencode-sdk-provider.js'
import { readProviderErrorCode } from '../src/providers/provider-error.js'

const { createOpencodeClientMock, spawnMock } = vi.hoisted(() => ({
  createOpencodeClientMock: vi.fn(),
  spawnMock: vi.fn(),
}))

vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: createOpencodeClientMock,
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

type FakeProc = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
  exitCode: number | null
}

const makeFakeProc = (params: {
  startupError?: string
}): FakeProc => {
  const proc = new EventEmitter() as FakeProc
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.exitCode = null
  proc.kill = vi.fn((): boolean => {
    if (proc.exitCode !== null) return true
    proc.exitCode = 0
    setTimeout(() => {
      proc.emit('exit', 0)
    }, 0)
    return true
  })
  if (params.startupError) {
    setTimeout(() => {
      proc.stderr.emit('data', params.startupError)
      proc.exitCode = 1
      proc.emit('exit', 1)
    }, 0)
  }
  return proc
}

beforeEach(() => {
  createOpencodeClientMock.mockReset()
  spawnMock.mockReset()
})

test('opencode provider surfaces server start error without secondary finally crash', async () => {
  spawnMock.mockReturnValueOnce(
    makeFakeProc({
      startupError: 'boot failed',
    }),
  )

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

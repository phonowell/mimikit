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
  startupUrl?: string
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
  if (params.startupUrl) {
    setTimeout(() => {
      proc.stdout.emit(
        'data',
        `opencode server listening on ${params.startupUrl}\n`,
      )
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

test('opencode provider ignores stale assistant usage from reused thread before new response appears', async () => {
  const reusedSessionId = 'ses_reused_for_usage_test'
  const oldCreatedAt = Date.now() - 60_000
  const newCreatedAt = Date.now() + 1_000
  const oldUsage = {
    input: 1200,
    output: 800,
    total: 2000,
    inputCacheRead: 300,
    inputCacheWrite: 100,
  }
  const newUsage = {
    input: 10,
    output: 2,
    total: 12,
    inputCacheRead: 3,
    inputCacheWrite: 1,
  }
  const sessionGetMock = vi.fn(async () => ({
    data: { id: reusedSessionId },
  }))
  const promptAsyncMock = vi.fn(async () => ({ data: {} }))
  const messagesMock = vi
    .fn()
    .mockResolvedValueOnce({
      data: [
        {
          info: {
            role: 'assistant',
            time: { created: oldCreatedAt, completed: oldCreatedAt + 50 },
            tokens: {
              input: oldUsage.input,
              output: oldUsage.output,
              total: oldUsage.total,
              cache: {
                read: oldUsage.inputCacheRead,
                write: oldUsage.inputCacheWrite,
              },
            },
          },
          parts: [{ type: 'text', text: 'stale output' }],
        },
      ],
    })
    .mockResolvedValueOnce({
      data: [
        {
          info: {
            role: 'assistant',
            time: { created: oldCreatedAt, completed: oldCreatedAt + 50 },
            tokens: {
              input: oldUsage.input,
              output: oldUsage.output,
              total: oldUsage.total,
              cache: {
                read: oldUsage.inputCacheRead,
                write: oldUsage.inputCacheWrite,
              },
            },
          },
          parts: [{ type: 'text', text: 'stale output' }],
        },
        {
          info: {
            role: 'assistant',
            time: { created: newCreatedAt, completed: newCreatedAt + 100 },
            tokens: {
              input: newUsage.input,
              output: newUsage.output,
              total: newUsage.total,
              cache: {
                read: newUsage.inputCacheRead,
                write: newUsage.inputCacheWrite,
              },
            },
          },
          parts: [{ type: 'text', text: 'fresh output' }],
        },
      ],
    })
  const statusMock = vi.fn(async () => ({
    data: {
      [reusedSessionId]: { type: 'idle' },
    },
  }))
  const disposeMock = vi.fn(async () => {})

  createOpencodeClientMock.mockReturnValue({
    session: {
      create: vi.fn(),
      get: sessionGetMock,
      promptAsync: promptAsyncMock,
      messages: messagesMock,
      status: statusMock,
    },
    instance: {
      dispose: disposeMock,
    },
  })
  spawnMock.mockReturnValueOnce(
    makeFakeProc({
      startupUrl: 'http://127.0.0.1:42123',
    }),
  )

  const onUsage = vi.fn()
  const result = await opencodeSdkProvider.run({
    provider: 'opencode-sdk',
    role: 'worker',
    prompt: 'new prompt after thread reuse',
    workDir: '/tmp/mimikit-opencode-provider-stale-usage',
    timeoutMs: 5000,
    model: 'big-pickle',
    threadId: reusedSessionId,
    onUsage,
  })

  expect(result.output).toBe('fresh output')
  expect(result.threadId).toBe(reusedSessionId)
  expect(result.usage).toEqual(newUsage)
  expect(onUsage).toHaveBeenCalledTimes(1)
  expect(onUsage).toHaveBeenLastCalledWith(newUsage)
  expect(sessionGetMock).toHaveBeenCalledTimes(1)
  expect(promptAsyncMock).toHaveBeenCalledTimes(1)
  expect(statusMock).toHaveBeenCalled()
})

test('opencode provider emits runtime child lifecycle callbacks', async () => {
  const proc = makeFakeProc({ startupUrl: 'http://127.0.0.1:42100' })
  spawnMock.mockReturnValueOnce(proc)

  const sessionId = 'session-1'
  const messages = [
    {
      info: {
        role: 'assistant',
        time: { created: Date.now(), completed: Date.now() + 1 },
        tokens: { input: 1, output: 1, total: 2 },
      },
      parts: [{ type: 'text', text: 'done' }],
    },
  ]
  const dispose = vi.fn(async () => undefined)
  const promptAsync = vi.fn(async () => undefined)
  const sessionCreate = vi.fn(async () => ({ data: { id: sessionId } }))
  const sessionMessages = vi.fn(async () => ({ data: messages }))
  const sessionStatus = vi.fn(async () => ({
    data: { [sessionId]: { type: 'idle' } },
  }))

  createOpencodeClientMock.mockReturnValue({
    instance: { dispose },
    session: {
      create: sessionCreate,
      get: vi.fn(),
      promptAsync,
      messages: sessionMessages,
      status: sessionStatus,
    },
  })

  const started = vi.fn(async () => undefined)
  const stopped = vi.fn(async () => undefined)

  const result = await opencodeSdkProvider.run({
    provider: 'opencode-sdk',
    role: 'worker',
    prompt: 'ping',
    workDir: '/tmp/mimikit-opencode-provider',
    timeoutMs: 5000,
    model: 'big-pickle',
    onRuntimeChildStarted: started,
    onRuntimeChildStopped: stopped,
  })

  expect(result.output).toBe('done')
  expect(started).toHaveBeenCalledTimes(1)
  expect(stopped).toHaveBeenCalledTimes(1)
  expect(started.mock.calls[0]?.[0]).toMatchObject({
    kind: 'opencode-server',
    meta: { model: 'opencode/big-pickle' },
  })
})

test('opencode provider times out when session has no progress', async () => {
  const proc = makeFakeProc({ startupUrl: 'http://127.0.0.1:42155' })
  spawnMock.mockReturnValueOnce(proc)

  const sessionId = 'session-timeout'
  createOpencodeClientMock.mockReturnValue({
    instance: {
      dispose: vi.fn(async () => undefined),
    },
    session: {
      create: vi.fn(async () => ({ data: { id: sessionId } })),
      get: vi.fn(),
      promptAsync: vi.fn(async () => undefined),
      messages: vi.fn(async () => ({ data: [] })),
      status: vi.fn(async () => ({
        data: { [sessionId]: { type: 'running' } },
      })),
    },
  })

  let caught: unknown
  try {
    await opencodeSdkProvider.run({
      provider: 'opencode-sdk',
      role: 'worker',
      prompt: 'wait forever',
      workDir: '/tmp/mimikit-opencode-provider-timeout',
      timeoutMs: 40,
      model: 'big-pickle',
    })
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(Error)
  expect(readProviderErrorCode(caught)).toBe('provider_timeout')
  expect((caught as Error).message).toContain('timed out after 40ms')
})

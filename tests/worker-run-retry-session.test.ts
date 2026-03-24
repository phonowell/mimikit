import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi, beforeEach, afterEach } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { ProviderError } from '../src/execution/providers/provider-error.js'
import { runTaskWithRetry } from '../src/execution/worker/run-retry.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'
import type { Task } from '../src/foundation/types/index.js'
import type { WorkerLlmResult } from '../src/execution/worker/run-retry.js'

const { runWorkerMock, appendLogMock, persistRuntimeStateMock } = vi.hoisted(
  () => ({
    runWorkerMock: vi.fn(),
    appendLogMock: vi.fn(async () => undefined),
    persistRuntimeStateMock: vi.fn(async () => undefined),
  }),
)

vi.mock('../src/execution/worker/profiled-runner.js', () => ({
  runWorker: runWorkerMock,
}))

vi.mock('../src/persistence/log/append.js', () => ({
  appendLog: appendLogMock,
}))

vi.mock('../src/kernel/orchestrator/runtime-persistence.js', () => ({
  persistRuntimeState: persistRuntimeStateMock,
}))

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-worker-run-retry-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    runtimeId: 'runtime-run-retry-test',
    withGlobalFocus: false,
  })
  runtime.config.worker.retry.maxAttempts = 0
  runtime.config.worker.retry.backoffMs = 0
  runtime.worker.queue = {
    add: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    sizeBy: vi.fn().mockReturnValue(0),
  } as unknown as RuntimeState['worker']['queue']
  return runtime
}

const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'run task',
  title: 'run task',
  cwd: '/tmp/run-retry-task',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-06T00:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  runWorkerMock.mockReset()
  appendLogMock.mockClear()
  persistRuntimeStateMock.mockClear()
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

const expectDiscardedSession = (params: {
  task: Task
  firstSessionId: string
}) => {
  expect(runWorkerMock).toHaveBeenCalledTimes(2)
  expect(runWorkerMock.mock.calls[0]?.[0]?.sessionId).toBe(params.firstSessionId)
  expect(runWorkerMock.mock.calls[1]?.[0]?.sessionId).toBeUndefined()
  expect(params.task.sessionId).toBeUndefined()
  expect(params.task.sessionState).toBe('discarded')
  expect(
    appendLogMock.mock.calls.some(
      (call) => call[1]?.event === 'worker_session_discarded',
    ),
  ).toBe(true)
}

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
  expect(
    appendLogMock.mock.calls.some(
      (call) => call[1]?.event === 'worker_session_bound',
    ),
  ).toBe(true)
})

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

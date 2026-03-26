import { expect, test, vi, beforeEach } from 'vitest'

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

const { runTaskWithRetry } = await import('../src/execution/worker/run-retry.js')

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({
    runtimeId: 'runtime-run-retry-resume-instruction-test',
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

test('runTaskWithRetry forwards resume instruction on resumed thread', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-resume-instruction', {
    sessionId: 'session-existing',
    sessionState: 'reusable',
    resumeInstruction: '继续原任务，但先检查当前工作区和已有产物是否一致。',
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
  expect(runWorkerMock.mock.calls[0]?.[0]?.resumeInstruction).toBe(
    '继续原任务，但先检查当前工作区和已有产物是否一致。',
  )
})

test('runTaskWithRetry forwards turn-start callback to worker runner', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-resume-turn-start')
  const onTurnStarted = vi.fn()

  runWorkerMock.mockImplementationOnce(
    async ({ onTurnStarted: notifyStarted }: { onTurnStarted?: () => void }) => {
      notifyStarted?.()
      return {
        output: 'done',
        elapsedMs: 1,
      } satisfies WorkerLlmResult
    },
  )

  await runTaskWithRetry({
    runtime,
    task,
    controller: new AbortController(),
    onTurnStarted,
  })

  expect(onTurnStarted).toHaveBeenCalledTimes(1)
})

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, vi } from 'vitest'

import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { Task } from '../../src/foundation/types/index.js'
import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

const hoistedMocks = vi.hoisted(() => ({
  runWorkerMock: vi.fn(),
  appendLogMock: vi.fn(() => Promise.resolve(undefined)),
  persistRuntimeStateMock: vi.fn(() => Promise.resolve(undefined)),
}))

export const { runWorkerMock, appendLogMock, persistRuntimeStateMock } =
  hoistedMocks

vi.mock('../../src/execution/worker/profiled-runner.js', () => ({
  runWorker: hoistedMocks.runWorkerMock,
}))

vi.mock('../../src/persistence/log/append.js', () => ({
  appendLog: hoistedMocks.appendLogMock,
}))

vi.mock('../../src/kernel/orchestrator/runtime-persistence.js', () => ({
  persistRuntimeState: hoistedMocks.persistRuntimeStateMock,
}))

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-worker-run-retry-'))
  tempDirs.push(dir)
  return dir
}

export const createRuntime = async (): Promise<RuntimeState> => {
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

export const createTask = (
  id: string,
  overrides: Partial<Task> = {},
): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'run task',
  title: 'run task',
  cwd: process.cwd(),
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
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

export const expectDiscardedSession = (params: {
  task: Task
  firstSessionId: string
}) => {
  expect(runWorkerMock).toHaveBeenCalledTimes(2)
  expect(runWorkerMock.mock.calls[0]?.[0]?.sessionId).toBe(
    params.firstSessionId,
  )
  expect(runWorkerMock.mock.calls[1]?.[0]?.sessionId).toBeUndefined()
  expect(params.task.sessionId).toBeUndefined()
  expect(params.task.sessionState).toBe('discarded')
  expect(
    appendLogMock.mock.calls.some(
      (call) => call[1]?.event === 'worker_session_discarded',
    ),
  ).toBe(true)
}

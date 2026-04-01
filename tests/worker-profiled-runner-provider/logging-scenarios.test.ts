import { beforeEach, expect, test, vi } from 'vitest'

import type { Task } from '../../src/foundation/types/index.js'

const hoistedMocks = vi.hoisted(() => ({
  appendTaskProgressMock: vi.fn(() => Promise.resolve(undefined)),
  buildWorkerPromptMock: vi.fn(() => Promise.resolve('worker prompt')),
  runWithProviderMock: vi.fn(() =>
    Promise.resolve({
      output: '{"reply":"ok","handoff":{"summary":"done"}}',
      elapsedMs: 12,
    }),
  ),
  runWorkerLoopMock: vi.fn(),
}))

vi.mock('../../src/persistence/storage/task-progress.js', () => ({
  appendTaskProgress: hoistedMocks.appendTaskProgressMock,
}))

vi.mock('../../src/policy/prompts/build-prompts.js', () => ({
  buildWorkerPrompt: hoistedMocks.buildWorkerPromptMock,
}))

vi.mock('../../src/execution/providers/registry.js', () => ({
  runWithProvider: hoistedMocks.runWithProviderMock,
}))

vi.mock('../../src/execution/worker/profiled-runner-loop.js', () => ({
  runWorkerLoop: hoistedMocks.runWorkerLoopMock,
}))

const { runWorker } =
  await import('../../src/execution/worker/profiled-runner.js')

const createTask = (resourceMode?: Task['resourceMode']): Task => ({
  id: 'task-worker-log',
  fingerprint: 'fp-task-worker-log',
  semanticKey: 'sk-task-worker-log',
  executionSpecId: 'spec-task-worker-log',
  title: 'Worker log',
  cwd: '/tmp/task-worker-log',
  focusId: 'focus-worker-log',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-29T08:00:00.000Z',
  ...(resourceMode ? { resourceMode } : {}),
})

beforeEach(() => {
  hoistedMocks.appendTaskProgressMock.mockClear()
  hoistedMocks.buildWorkerPromptMock.mockClear()
  hoistedMocks.runWithProviderMock.mockClear()
  hoistedMocks.runWorkerLoopMock.mockReset()
  hoistedMocks.runWorkerLoopMock.mockImplementation(
    (params: {
      prompt: string
      runModel: (input: {
        prompt: string
        threadId?: string | null
      }) => Promise<unknown>
    }) =>
      params.runModel({
        prompt: params.prompt,
        threadId: 'thread-worker-log',
      }),
  )
})

test('runWorker forwards worker llm log path and task context to provider', async () => {
  await runWorker({
    runtimeId: 'runtime-worker-log',
    stateDir: '/tmp/mimikit-state',
    cwd: '/tmp/task-worker-log',
    task: createTask(),
    timeoutMs: 30_000,
  })

  expect(hoistedMocks.runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'codex-sdk',
      role: 'worker',
      runtimeId: 'runtime-worker-log',
      workDir: '/tmp/task-worker-log',
      logPath: '/tmp/mimikit-state/log.jsonl',
      logContext: expect.objectContaining({
        event: 'llm_call',
        role: 'worker',
        taskId: 'task-worker-log',
        focusId: 'focus-worker-log',
        executionSpecId: 'spec-task-worker-log',
        taskProfile: 'worker',
      }),
    }),
  )
})

test('runWorker forwards task resource mode to provider requests', async () => {
  await runWorker({
    runtimeId: 'runtime-worker-log',
    stateDir: '/tmp/mimikit-state',
    cwd: '/tmp/task-worker-log',
    task: createTask('read'),
    timeoutMs: 30_000,
  })

  expect(hoistedMocks.runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'codex-sdk',
      role: 'worker',
      resourceMode: 'read',
    }),
  )
})

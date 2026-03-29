import { beforeEach, expect, test, vi } from 'vitest'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { WorkerLlmResult } from '../src/execution/worker/run-retry-model.js'
import type { Task } from '../src/foundation/types/index.js'

const { runWorkerMock } = vi.hoisted(() => ({
  runWorkerMock: vi.fn(),
}))

vi.mock('../src/execution/worker/profiled-runner.js', () => ({
  runWorker: runWorkerMock,
}))

const { runTaskModel } =
  await import('../src/execution/worker/run-retry-model.js')

const createTask = (id: string, resourceMode: Task['resourceMode']): Task => ({
  id,
  fingerprint: `fp-${id}`,
  semanticKey: `sk-${id}`,
  executionSpecId: `spec-${id}`,
  title: id,
  cwd: '/tmp/worker-read-reasoning',
  resourceMode,
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-29T00:00:00.000Z',
})

beforeEach(() => {
  runWorkerMock.mockReset()
  runWorkerMock.mockResolvedValue({
    output: 'ok',
    handoff: { summary: 'done' },
    elapsedMs: 1,
  } satisfies WorkerLlmResult)
})

test('runTaskModel lowers reasoning effort for read tasks', async () => {
  const runtime = await createTestRuntimeState()
  runtime.config.codex.modelReasoningEffort = 'high'

  await runTaskModel({
    runtime,
    task: createTask('task-read', 'read'),
    controller: new AbortController(),
  })

  expect(runWorkerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      modelReasoningEffort: 'medium',
    }),
  )
})

test('runTaskModel keeps configured reasoning effort for write tasks', async () => {
  const runtime = await createTestRuntimeState()
  runtime.config.codex.modelReasoningEffort = 'high'

  await runTaskModel({
    runtime,
    task: createTask('task-write', 'write'),
    controller: new AbortController(),
  })

  expect(runWorkerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      modelReasoningEffort: 'high',
    }),
  )
})

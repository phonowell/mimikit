import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../src/log/append.js', () => ({
  appendLog: vi.fn(async () => {}),
}))

vi.mock('../src/log/safe.js', () => ({
  bestEffort: vi.fn(async (_context: string, fn: () => Promise<unknown>) => {
    await fn()
  }),
}))

vi.mock('../src/orchestrator/core/runtime-persistence.js', () => ({
  persistRuntimeState: vi.fn(async () => {}),
}))

vi.mock('../src/worker/standard-runner.js', () => ({
  runStandardWorker: vi.fn(),
}))

vi.mock('../src/worker/specialist-runner.js', () => ({
  runSpecialistWorker: vi.fn(),
}))

import { runTaskWithRetry } from '../src/worker/run-retry.js'
import { runStandardWorker } from '../src/worker/standard-runner.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { Task } from '../src/types/index.js'

const buildRuntime = (retryMaxAttempts: number): RuntimeState =>
  ({
    config: {
      worker: {
        retryMaxAttempts,
        retryBackoffMs: 1,
        standard: {
          timeoutMs: 300_000,
          model: 'gpt-5.2-high',
          modelReasoningEffort: 'high',
        },
        specialist: {
          timeoutMs: 600_000,
          model: 'gpt-5.3-codex-high',
          modelReasoningEffort: 'high',
        },
      },
    },
    paths: { log: '/tmp/mimikit-test.log' },
  }) as RuntimeState

const buildTask = (): Task =>
  ({
    id: 'task-retry-1',
    prompt: 'test prompt',
    profile: 'standard',
    status: 'running',
    createdAt: new Date().toISOString(),
  }) as Task

beforeEach(() => {
  vi.mocked(runStandardWorker).mockReset()
})

test('aborted-like error retries when controller is not canceled', async () => {
  vi.mocked(runStandardWorker)
    .mockRejectedValueOnce(new Error('This operation was aborted'))
    .mockResolvedValueOnce({ output: 'ok', elapsedMs: 10 })

  const result = await runTaskWithRetry({
    runtime: buildRuntime(1),
    task: buildTask(),
    controller: new AbortController(),
  })

  expect(result.output).toBe('ok')
  expect(vi.mocked(runStandardWorker)).toHaveBeenCalledTimes(2)
})

test(
  'aborted-like error is not rewritten as Task canceled when not canceled',
  async () => {
    vi.mocked(runStandardWorker).mockRejectedValueOnce(
      new Error('This operation was aborted'),
    )

    await expect(
      runTaskWithRetry({
        runtime: buildRuntime(0),
        task: buildTask(),
        controller: new AbortController(),
      }),
    ).rejects.toThrow('This operation was aborted')
  },
)

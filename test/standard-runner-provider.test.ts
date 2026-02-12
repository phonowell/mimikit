import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../src/prompts/build-prompts.js', () => ({
  buildWorkerPrompt: vi.fn(async () => 'worker prompt'),
}))

vi.mock('../src/providers/registry.js', () => ({
  runWithProvider: vi.fn(),
}))

vi.mock('../src/storage/llm-archive.js', () => ({
  appendLlmArchiveResult: vi.fn(async () => {}),
}))

vi.mock('../src/storage/task-progress.js', () => ({
  appendTaskProgress: vi.fn(async () => {}),
}))

import { runWithProvider } from '../src/providers/registry.js'
import { runStandardWorker } from '../src/worker/profiled-runner.js'

import type { Task } from '../src/types/index.js'

const buildTask = (): Task => ({
  id: 'task-standard-provider',
  fingerprint: 'task-standard-provider',
  prompt: 'analyze task',
  title: 'analyze task',
  profile: 'standard',
  status: 'running',
  createdAt: new Date().toISOString(),
})

beforeEach(() => {
  vi.mocked(runWithProvider).mockReset()
})

test('runStandardWorker routes to opencode and passes raw output', async () => {
  const task = buildTask()
  vi.mocked(runWithProvider).mockImplementation(async (request) => {
    if ('onUsage' in request && typeof request.onUsage === 'function') {
      request.onUsage({ input: 4, output: 6, total: 10 })
      expect(task.usage).toMatchObject({ input: 4, output: 6, total: 10 })
    }
    return {
      output: 'plain text output',
      elapsedMs: 10,
      usage: { input: 1, output: 1, total: 2 },
    }
  })

  const result = await runStandardWorker({
    stateDir: '/tmp/mimikit-test-state',
    workDir: '/tmp/mimikit-test-work',
    task,
    timeoutMs: 5_000,
    model: 'opencode/big-pickle',
    modelReasoningEffort: 'high',
  })

  expect(vi.mocked(runWithProvider)).toHaveBeenCalledTimes(1)
  expect(vi.mocked(runWithProvider).mock.calls[0]?.[0]).toMatchObject({
    provider: 'opencode',
    role: 'worker',
    model: 'opencode/big-pickle',
    modelReasoningEffort: 'high',
    workDir: '/tmp/mimikit-test-work',
  })
  expect(result.output).toBe('plain text output')
  expect(result.usage).toMatchObject({ input: 1, output: 1, total: 2 })
  expect(task.usage).toMatchObject({ input: 1, output: 1, total: 2 })
})

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
import { appendLlmArchiveResult } from '../src/storage/llm-archive.js'
import { runSpecialistWorker } from '../src/worker/profiled-runner.js'

import type { Task } from '../src/types/index.js'

const buildTask = (): Task => ({
  id: 'task-specialist-provider',
  fingerprint: 'task-specialist-provider',
  prompt: 'analyze task',
  title: 'analyze task',
  profile: 'specialist',
  status: 'running',
  createdAt: new Date().toISOString(),
})

beforeEach(() => {
  vi.mocked(runWithProvider).mockReset()
  vi.mocked(appendLlmArchiveResult).mockReset()
})

test('runSpecialistWorker routes to codex-sdk and passes raw output', async () => {
  vi.mocked(runWithProvider).mockResolvedValue({
    output: 'plain text output',
    elapsedMs: 12,
    usage: { input: 2, output: 3, total: 5 },
    threadId: 'session-2',
  })

  const task = buildTask()
  const result = await runSpecialistWorker({
    stateDir: '/tmp/mimikit-test-state',
    workDir: '/tmp/mimikit-test-work',
    task,
    timeoutMs: 5_000,
    model: 'gpt-5.3-codex-high',
    modelReasoningEffort: 'high',
  })

  expect(vi.mocked(runWithProvider)).toHaveBeenCalledTimes(1)
  expect(vi.mocked(runWithProvider).mock.calls[0]?.[0]).toMatchObject({
    provider: 'codex-sdk',
    role: 'worker',
    model: 'gpt-5.3-codex-high',
    modelReasoningEffort: 'high',
    workDir: '/tmp/mimikit-test-work',
  })
  expect(result.output).toBe('plain text output')
  expect(result.usage).toMatchObject({ input: 2, output: 3, total: 5 })
  expect(task.usage).toMatchObject({ input: 2, output: 3, total: 5 })
  expect(vi.mocked(appendLlmArchiveResult).mock.calls.at(-1)?.[1]).toMatchObject({
    threadId: 'session-2',
  })
})

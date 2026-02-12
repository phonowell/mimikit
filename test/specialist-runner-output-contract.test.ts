import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../src/prompts/build-prompts.js', () => ({
  buildWorkerPrompt: vi.fn(async () => 'worker prompt'),
}))

vi.mock('../src/providers/run.js', () => ({
  runWithProvider: vi.fn(),
}))

vi.mock('../src/storage/llm-archive.js', () => ({
  appendLlmArchiveResult: vi.fn(async () => {}),
}))

vi.mock('../src/storage/task-progress.js', () => ({
  appendTaskProgress: vi.fn(async () => {}),
}))

import { runWithProvider } from '../src/providers/run.js'
import { runSpecialistWorker } from '../src/worker/specialist-runner.js'

import type { Task } from '../src/types/index.js'

const buildTask = (): Task => ({
  id: 'task-specialist-contract',
  fingerprint: 'task-specialist-contract',
  prompt: 'analyze task',
  title: 'analyze task',
  profile: 'specialist',
  status: 'running',
  createdAt: new Date().toISOString(),
})

const validOutput = JSON.stringify({
  answer: 'done',
  evidence: [{ ref: 'analysis:1', summary: 'reasoned from provided inputs' }],
  sources: ['local:task'],
  checks: [{ name: 'all_constraints_met', passed: true, detail: 'yes' }],
  confidence: 0.91,
  execution_insights: {
    summary: 'no blockers',
    blockers: [],
    next_run_hints: ['keep same format'],
  },
})

beforeEach(() => {
  vi.mocked(runWithProvider).mockReset()
})

test('runSpecialistWorker retries once when first output violates contract', async () => {
  vi.mocked(runWithProvider)
    .mockResolvedValueOnce({
      output: 'plain text invalid output',
      elapsedMs: 10,
      usage: { input: 1, output: 1, total: 2 },
    })
    .mockResolvedValueOnce({
      output: validOutput,
      elapsedMs: 12,
      usage: { input: 2, output: 3, total: 5 },
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

  expect(vi.mocked(runWithProvider)).toHaveBeenCalledTimes(2)
  expect(JSON.parse(result.output)).toMatchObject({
    answer: 'done',
    confidence: 0.91,
  })
  expect(result.usage).toMatchObject({ input: 3, output: 4, total: 7 })
  expect(task.usage).toMatchObject({ input: 3, output: 4, total: 7 })
})

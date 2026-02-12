import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../src/actions/registry/index.js', () => ({
  listInvokableActionNames: vi.fn(() => ['run_browser']),
}))

vi.mock('../src/prompts/build-prompts.js', () => ({
  buildWorkerPrompt: vi.fn(async () => 'worker prompt'),
}))

vi.mock('../src/providers/run.js', () => ({
  runWithProvider: vi.fn(),
}))

vi.mock('../src/storage/task-checkpoint.js', () => ({
  loadTaskCheckpoint: vi.fn(async () => null),
  saveTaskCheckpoint: vi.fn(async () => {}),
}))

vi.mock('../src/storage/task-progress.js', () => ({
  appendTaskProgress: vi.fn(async () => {}),
}))

vi.mock('../src/worker/standard-step.js', () => ({
  parseStandardStep: vi.fn(),
}))

vi.mock('../src/worker/standard-step-exec.js', () => ({
  executeStandardStep: vi.fn(async (params: { actionCall: { name: string } }) => ({
    record: {
      round: 1,
      action: params.actionCall.name,
      ok: true,
      output: 'ok',
    },
    transcriptEntry: `action: ${params.actionCall.name}`,
  })),
}))

import { runWithProvider } from '../src/providers/run.js'
import { parseStandardStep } from '../src/worker/standard-step.js'
import { executeStandardStep } from '../src/worker/standard-step-exec.js'
import { runStandardWorker } from '../src/worker/standard-runner.js'

import type { Task } from '../src/types/index.js'

const buildTask = (): Task => ({
  id: 'task-standard-multi-actions',
  fingerprint: 'task-standard-multi-actions',
  prompt: 'collect bilibili homepage videos',
  title: 'collect bilibili homepage videos',
  profile: 'standard',
  status: 'running',
  createdAt: new Date().toISOString(),
})

beforeEach(() => {
  vi.mocked(runWithProvider).mockReset()
  vi.mocked(parseStandardStep).mockReset()
  vi.mocked(executeStandardStep).mockClear()
})

test('runStandardWorker executes multi actions sequentially in one round', async () => {
  vi.mocked(runWithProvider)
    .mockResolvedValueOnce({
      output: 'first round planner output',
      elapsedMs: 1,
      usage: { input: 1, output: 1, total: 2 },
    })
    .mockResolvedValueOnce({
      output: 'final round planner output',
      elapsedMs: 1,
      usage: { input: 1, output: 1, total: 2 },
    })

  vi.mocked(parseStandardStep)
    .mockReturnValueOnce({
      kind: 'actions',
      actionCalls: [
        {
          name: 'run_browser',
          args: { command: '--session bili open https://www.bilibili.com/' },
        },
        {
          name: 'run_browser',
          args: { command: '--session bili snapshot -i' },
        },
      ],
    })
    .mockReturnValueOnce({
      kind: 'final',
      output: 'done',
    })

  const result = await runStandardWorker({
    stateDir: '/tmp/mimikit-test-state',
    workDir: '/tmp/mimikit-test-work',
    task: buildTask(),
    timeoutMs: 5_000,
    model: 'gpt-5.2-high',
    modelReasoningEffort: 'high',
  })

  expect(result.output).toBe('done')
  expect(vi.mocked(executeStandardStep)).toHaveBeenCalledTimes(2)
  expect(vi.mocked(executeStandardStep).mock.calls[0]?.[0]).toMatchObject({
    round: 1,
    actionIndex: 1,
    actionCount: 2,
    actionCall: {
      name: 'run_browser',
      args: { command: '--session bili open https://www.bilibili.com/' },
    },
  })
  expect(vi.mocked(executeStandardStep).mock.calls[1]?.[0]).toMatchObject({
    round: 1,
    actionIndex: 2,
    actionCount: 2,
    actionCall: {
      name: 'run_browser',
      args: { command: '--session bili snapshot -i' },
    },
  })
})

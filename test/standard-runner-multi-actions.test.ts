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
  executeStandardStep: vi.fn(
    async (params: {
      actionCall: { name: string }
      actionIndex?: number
      round: number
    }) => ({
      record: {
        round: 1,
        action: params.actionCall.name,
        evidenceRef: `action:${params.round}.${params.actionIndex ?? 1}`,
        ok: true,
        output: 'ok',
      },
      transcriptEntry: `action: ${params.actionCall.name}`,
    }),
  ),
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
      output: JSON.stringify({
        answer: 'done',
        evidence: [
          { ref: 'action:1.1', summary: 'opened homepage' },
          { ref: 'action:1.2', summary: 'captured snapshot' },
        ],
        sources: ['https://www.bilibili.com/'],
        checks: [{ name: 'actions_executed', passed: true, detail: '2 actions' }],
        confidence: 0.9,
        execution_insights: {
          summary: 'completed without blockers',
          blockers: [],
          next_run_hints: ['reuse same steps'],
        },
      }),
    })

  const task = buildTask()
  const result = await runStandardWorker({
    stateDir: '/tmp/mimikit-test-state',
    workDir: '/tmp/mimikit-test-work',
    task,
    timeoutMs: 5_000,
    model: 'gpt-5.2-high',
    modelReasoningEffort: 'high',
  })

  expect(JSON.parse(result.output)).toMatchObject({
    answer: 'done',
    confidence: 0.9,
  })
  expect(task.usage).toMatchObject({ input: 2, output: 2, total: 4 })
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

test('runStandardWorker retries once when final output violates contract', async () => {
  vi.mocked(runWithProvider)
    .mockResolvedValueOnce({
      output: 'first round planner output',
      elapsedMs: 1,
      usage: { input: 1, output: 1, total: 2 },
    })
    .mockResolvedValueOnce({
      output: 'invalid final output',
      elapsedMs: 1,
      usage: { input: 1, output: 1, total: 2 },
    })
    .mockResolvedValueOnce({
      output: 'repaired final output',
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
      ],
    })
    .mockReturnValueOnce({
      kind: 'final',
      output: 'plain text final',
    })
    .mockReturnValueOnce({
      kind: 'final',
      output: JSON.stringify({
        answer: 'repaired',
        evidence: [{ ref: 'action:1.1', summary: 'opened homepage' }],
        sources: ['https://www.bilibili.com/'],
        checks: [{ name: 'contract_valid', passed: true, detail: 'ok' }],
        confidence: 0.95,
        execution_insights: {
          summary: 'first final invalid then repaired',
          blockers: [],
          next_run_hints: ['keep json strict'],
        },
      }),
    })

  const task = buildTask()
  const result = await runStandardWorker({
    stateDir: '/tmp/mimikit-test-state',
    workDir: '/tmp/mimikit-test-work',
    task,
    timeoutMs: 5_000,
    model: 'gpt-5.2-high',
    modelReasoningEffort: 'high',
  })

  expect(vi.mocked(runWithProvider)).toHaveBeenCalledTimes(3)
  expect(JSON.parse(result.output)).toMatchObject({
    answer: 'repaired',
    confidence: 0.95,
  })
  expect(task.usage).toMatchObject({ input: 3, output: 3, total: 6 })
})

import { beforeEach, expect, test, vi } from 'vitest'

import { buildProviderTimeoutError } from '../src/execution/providers/provider-error.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const hoistedMocks = vi.hoisted(() => ({
  appendLogMock: vi.fn(() => Promise.resolve(undefined)),
  appendManagerUsageLedgerEntryMock: vi.fn(() => Promise.resolve(undefined)),
  runManagerMock: vi.fn(),
}))

vi.mock('../src/persistence/log/append.js', () => ({
  appendLog: hoistedMocks.appendLogMock,
}))

vi.mock('../src/persistence/storage/usage-ledger.js', () => ({
  appendManagerUsageLedgerEntry: hoistedMocks.appendManagerUsageLedgerEntryMock,
}))

vi.mock('../src/policy/manager/runner.js', () => ({
  runManager: hoistedMocks.runManagerMock,
}))

const { runManagerRoundWithRecovery } =
  await import('../src/policy/manager/loop-batch-exec.js')

beforeEach(() => {
  hoistedMocks.appendLogMock.mockClear()
  hoistedMocks.appendManagerUsageLedgerEntryMock.mockClear()
  hoistedMocks.runManagerMock.mockReset()
})

test('user_input timeout retries once with minimal packet and lower reasoning effort', async () => {
  hoistedMocks.runManagerMock
    .mockRejectedValueOnce(
      buildProviderTimeoutError('openai-responses', 120000),
    )
    .mockResolvedValueOnce({
      output: 'ok',
      actions: [],
      elapsedMs: 42,
      usage: { input: 10, output: 5, total: 15 },
      threadId: 'thread-manager-timeout',
      contextPacket: {
        id: 'packet-context-1',
        createdAt: '2026-04-16T00:00:00.000Z',
        wakeProfile: 'user_input',
        mode: 'minimal',
        counts: {
          inputs: 1,
          results: 0,
          tasks: 1,
          plans: 0,
          workingFocuses: 1,
        },
        activeTaskIds: ['task-1'],
        workingFocusIds: ['focus-global'],
      },
      promptBytes: 512,
      promptSegmentCount: 2,
      promptSections: {
        system: 100,
        action_surface: 100,
        state_packet: 120,
        event_packet: 100,
        project_profile: 40,
        remembered_memory: 20,
        memory: 32,
      },
      promptSelection: {
        tasks: { selected: 1, full: 0, card: 1 },
        plans: { selected: 0, full: 0, card: 0 },
      },
    })

  const runtime = await createTestRuntimeState({
    runtimeId: 'runtime-manager-timeout',
  })
  const input = {
    id: 'input-timeout-1',
    role: 'user',
    text: 'align docs',
    focusId: 'focus-global',
    createdAt: '2026-04-16T00:00:00.000Z',
  } as const

  const result = await runManagerRoundWithRecovery({
    runtime,
    batchId: 'batch-timeout-1',
    round: 1,
    inputs: [input],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    extra: {},
  } as never)

  expect(hoistedMocks.runManagerMock).toHaveBeenCalledTimes(2)
  expect(hoistedMocks.runManagerMock.mock.calls[0][0]).toMatchObject({
    packetMode: 'standard',
    modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
    retry: { maxAttempts: 0, backoffMs: runtime.config.worker.retry.backoffMs },
  })
  expect(hoistedMocks.runManagerMock.mock.calls[1][0]).toMatchObject({
    packetMode: 'minimal',
    modelReasoningEffort: 'medium',
    retry: { maxAttempts: 0, backoffMs: runtime.config.worker.retry.backoffMs },
  })
  expect(hoistedMocks.appendManagerUsageLedgerEntryMock).toHaveBeenCalledWith(
    expect.objectContaining({
      packetMode: 'minimal',
    }),
  )
  expect(result).toMatchObject({
    output: 'ok',
    wakeProfile: 'user_input',
  })
})

test('task_result rounds keep the existing retry policy', async () => {
  hoistedMocks.runManagerMock.mockResolvedValueOnce({
    output: 'ok',
    actions: [],
    elapsedMs: 12,
    usage: { input: 4, output: 2, total: 6 },
    contextPacket: {
      id: 'packet-context-2',
      createdAt: '2026-04-16T00:00:00.000Z',
      wakeProfile: 'task_result',
      mode: 'minimal',
      counts: {
        inputs: 0,
        results: 1,
        tasks: 1,
        plans: 0,
        workingFocuses: 1,
      },
      activeTaskIds: ['task-result-1'],
      workingFocusIds: ['focus-global'],
    },
    promptBytes: 256,
    promptSegmentCount: 2,
    promptSections: {
      system: 100,
      action_surface: 100,
      state_packet: 80,
      event_packet: 60,
      project_profile: 20,
      remembered_memory: 10,
      memory: 8,
    },
    promptSelection: {
      tasks: { selected: 1, full: 0, card: 1 },
      plans: { selected: 0, full: 0, card: 0 },
    },
  })

  const runtime = await createTestRuntimeState({
    runtimeId: 'runtime-manager-timeout-task-result',
  })

  await runManagerRoundWithRecovery({
    runtime,
    batchId: 'batch-timeout-2',
    round: 1,
    inputs: [],
    results: [
      {
        taskId: 'task-result-1',
        status: 'succeeded',
        ok: true,
        output: 'done',
        durationMs: 10,
        completedAt: '2026-04-16T00:00:00.000Z',
      },
    ],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    extra: {},
  } as never)

  expect(hoistedMocks.runManagerMock).toHaveBeenCalledTimes(1)
  expect(hoistedMocks.runManagerMock.mock.calls[0][0]).toMatchObject({
    packetMode: 'minimal',
    modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
    retry: runtime.config.worker.retry,
  })
})

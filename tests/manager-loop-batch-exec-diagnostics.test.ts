import { beforeEach, expect, test, vi } from 'vitest'

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
  hoistedMocks.runManagerMock.mockResolvedValue({
    output: 'ok',
    actions: [],
    elapsedMs: 12,
    usage: { input: 10, output: 5, total: 15 },
    threadId: 'thread-manager-1',
    traceRef: '.mimikit/traces/2026-04-01/manager-round-1.txt',
    contextPacket: {
      id: 'packet-context-1',
      createdAt: '2026-04-01T00:00:00.000Z',
      wakeProfile: 'user_input',
      mode: 'standard',
      counts: {
        inputs: 1,
        results: 0,
        tasks: 0,
        plans: 0,
        workingFocuses: 1,
      },
      activeTaskIds: [],
      workingFocusIds: ['focus-global'],
    },
    promptBytes: 1024,
    promptSegmentCount: 2,
    promptSections: {
      system: 100,
      action_surface: 100,
      state_packet: 300,
      event_packet: 200,
      project_profile: 100,
      remembered_memory: 100,
      memory: 124,
    },
    promptSelection: {
      tasks: { selected: 0, full: 0, card: 0 },
      plans: { selected: 0, full: 0, card: 0 },
    },
  })
})

test('manager round writes stable diagnostics keys across budget log, runner, result, and ledger', async () => {
  const runtime = await createTestRuntimeState({
    runtimeId: 'runtime-manager-diagnostics',
  })
  const input = {
    id: 'input-1',
    role: 'user',
    text: 'continue',
    focusId: 'focus-global',
    createdAt: '2026-04-01T00:00:00.000Z',
  }

  const result = await runManagerRoundWithRecovery({
    runtime,
    batchId: 'batch-1',
    round: 1,
    inputs: [input],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    extra: {},
  } as never)

  expect(hoistedMocks.appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'manager_context_budget_resolved',
      batchId: 'batch-1',
      roundId: expect.stringMatching(/^round-/),
    }),
  )
  expect(hoistedMocks.runManagerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      batchId: 'batch-1',
      roundId: expect.stringMatching(/^round-/),
    }),
  )
  expect(hoistedMocks.appendManagerUsageLedgerEntryMock).toHaveBeenCalledWith(
    expect.objectContaining({
      batchId: 'batch-1',
      roundId: expect.stringMatching(/^round-/),
      traceRef: '.mimikit/traces/2026-04-01/manager-round-1.txt',
    }),
  )
  expect(result).toMatchObject({
    batchId: 'batch-1',
    roundId: expect.stringMatching(/^round-/),
    traceRef: '.mimikit/traces/2026-04-01/manager-round-1.txt',
  })
})

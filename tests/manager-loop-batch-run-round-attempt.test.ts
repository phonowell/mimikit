import { beforeEach, expect, test, vi } from 'vitest'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { ManagerEnv } from '../src/foundation/types/index.js'

const hoistedMocks = vi.hoisted(() => ({
  runManagerMock: vi.fn(),
}))

vi.mock('../src/policy/manager/runner.js', () => ({
  runManager: hoistedMocks.runManagerMock,
}))

beforeEach(() => {
  hoistedMocks.runManagerMock.mockReset()
  hoistedMocks.runManagerMock.mockResolvedValue({
    output: 'ok',
    actions: [],
    elapsedMs: 1,
    contextPacket: {},
    promptBytes: 1,
    promptSegmentCount: 1,
    promptSections: [],
    promptSelection: {},
  })
})

test('runManagerRoundAttempt forwards manager retry backoff instead of worker retry backoff', async () => {
  const runtime = await createTestRuntimeState()
  runtime.config.manager.retry.backoffMs = 1234
  runtime.config.worker.retry.backoffMs = 99
  const managerEnv: ManagerEnv = { wakeProfile: 'user_input' }

  const { runManagerRoundAttempt } =
    await import('../src/policy/manager/loop-batch-run-round-attempt.js')

  await runManagerRoundAttempt({
    runtime,
    inputs: [],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    managerEnv,
    promptSectionLimits: runtime.config.manager.promptSections,
    wakeProfile: 'user_input',
    batchId: 'batch-1',
    roundId: 'round-1',
    packetMode: 'standard',
    modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
    retryMaxAttempts: runtime.config.manager.retry.maxAttempts,
  })

  expect(hoistedMocks.runManagerMock).toHaveBeenCalledTimes(1)
  expect(hoistedMocks.runManagerMock.mock.calls[0]?.[0]?.retry).toEqual({
    maxAttempts: runtime.config.manager.retry.maxAttempts,
    backoffMs: 1234,
  })
})

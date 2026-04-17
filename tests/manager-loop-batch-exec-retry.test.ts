import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { UserInput } from '../src/foundation/types/index.js'

const hoistedMocks = vi.hoisted(() => ({
  runManagerRoundAttemptMock: vi.fn(),
}))

vi.mock('../src/policy/manager/loop-batch-run-round-attempt.js', () => ({
  runManagerRoundAttempt: hoistedMocks.runManagerRoundAttemptMock,
}))

const buildAttemptResult = () => ({
  output: 'ok',
  actions: [],
  elapsedMs: 1,
  contextPacket: {},
  promptBytes: 1,
  promptSegmentCount: 1,
  promptSections: [],
  promptSelection: {},
})

beforeEach(() => {
  hoistedMocks.runManagerRoundAttemptMock.mockReset()
  hoistedMocks.runManagerRoundAttemptMock.mockResolvedValue(
    buildAttemptResult(),
  )
})

afterEach(() => {
  hoistedMocks.runManagerRoundAttemptMock.mockReset()
})

test('runManagerRoundWithRecovery uses manager retry budget for user input rounds', async () => {
  const runtime = await createTestRuntimeState()
  runtime.config.worker.retry.maxAttempts = 0
  runtime.config.manager.retry.maxAttempts = 2
  const input: UserInput = {
    id: 'input-user-1',
    role: 'user',
    text: '再试一次',
    createdAt: '2026-04-17T03:03:28.110Z',
    focusId: 'focus-global',
    source: 'webui',
    platform: 'webui',
  }

  const { runManagerRoundWithRecovery } =
    await import('../src/policy/manager/loop-batch-exec.js')

  await runManagerRoundWithRecovery({
    runtime,
    round: 1,
    batchId: 'batch-1',
    inputs: [input],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
  })

  expect(hoistedMocks.runManagerRoundAttemptMock).toHaveBeenCalledTimes(1)
  expect(
    hoistedMocks.runManagerRoundAttemptMock.mock.calls[0]?.[0]
      ?.retryMaxAttempts,
  ).toBe(2)
})

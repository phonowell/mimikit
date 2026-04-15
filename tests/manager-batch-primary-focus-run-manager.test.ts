import { beforeEach, expect, test, vi } from 'vitest'

import { runManagerBatch } from '../src/policy/manager/loop-batch-run-manager.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const { runManagerCorrectionRoundsMock } = vi.hoisted(() => ({
  runManagerCorrectionRoundsMock: vi.fn(),
}))

const { logManagerBatchStartMock } = vi.hoisted(() => ({
  logManagerBatchStartMock: vi.fn(() => undefined),
}))

vi.mock('../src/policy/manager/loop-batch-run-rounds.js', () => ({
  runManagerCorrectionRounds: runManagerCorrectionRoundsMock,
}))

vi.mock('../src/policy/manager/loop-batch-run-helpers.js', () => ({
  logManagerBatchStart: logManagerBatchStartMock,
}))

beforeEach(() => {
  runManagerCorrectionRoundsMock.mockReset()
  runManagerCorrectionRoundsMock.mockResolvedValue({
    parsed: { text: '', actions: [] },
    elapsedMs: 1,
  })
  logManagerBatchStartMock.mockClear()
})

test('runManagerBatch passes the ordered working focus ids into correction rounds', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      focuses: [
        {
          id: 'focus-a',
          title: 'Focus A',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
          lastActivityAt: '2026-03-20T00:00:00.000Z',
        },
        {
          id: 'focus-b',
          title: 'Focus B',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:01.000Z',
          lastActivityAt: '2026-03-20T00:00:01.000Z',
        },
      ],
    },
  })

  await runManagerBatch({
    runtime,
    inputs: [
      {
        id: 'input-older',
        role: 'user',
        text: 'older',
        createdAt: '2026-03-20T00:00:00.000Z',
        focusId: 'focus-a',
      },
      {
        id: 'input-latest',
        role: 'user',
        text: 'latest',
        createdAt: '2026-03-20T00:00:02.000Z',
        focusId: 'focus-b',
      },
    ],
    results: [],
  })

  expect(runManagerCorrectionRoundsMock).toHaveBeenCalledTimes(1)
  expect(runManagerCorrectionRoundsMock.mock.calls[0]?.[0]).toMatchObject({
    workingFocusIds: ['focus-b', 'focus-a'],
  })
})

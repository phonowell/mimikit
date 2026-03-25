import { beforeEach, expect, test, vi } from 'vitest'

import { processManagerBatch } from '../src/policy/manager/loop-batch.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const { runManagerBatchMock } = vi.hoisted(() => ({
  runManagerBatchMock: vi.fn(),
}))

vi.mock('../src/policy/manager/loop-batch-run-manager.js', () => ({
  runManagerBatch: runManagerBatchMock,
}))

beforeEach(() => {
  runManagerBatchMock.mockReset()
  runManagerBatchMock.mockResolvedValue({
    parsed: {
      text: '准备重启 mimikit 以应用更新。',
      actions: [
        {
          name: 'restart_runtime',
          attrs: {
            reason: '重启 mimikit 以应用刚完成的项目更新',
          },
        },
      ],
    },
    elapsedMs: 1,
  })
})

test('processManagerBatch flushes deferred restart after batch finalize', async () => {
  const exitRequests: Array<{
    code: number
    reason: string
    skipPersist?: boolean
  }> = []
  const runtime = await createTestRuntimeState({
    patch: {
      session: {
        requestExit: (request) => {
          exitRequests.push(request)
        },
      },
    },
  })

  await processManagerBatch({
    runtime,
    inputs: [
      {
        id: 'input-user',
        role: 'user',
        text: '更新完成后请重启 mimikit 让新代码生效。',
        createdAt: '2026-03-23T08:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    nextInputsCursor: 1,
    nextResultsCursor: 0,
  })

  expect(exitRequests).toEqual([
    {
      code: 75,
      reason: '重启 mimikit 以应用刚完成的项目更新',
      skipPersist: true,
    },
  ])
  expect(runtime.session.pendingRestartReason).toBeUndefined()
  expect(runtime.session.restartScheduled).toBe(true)
})

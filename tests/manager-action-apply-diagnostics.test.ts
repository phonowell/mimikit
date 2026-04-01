import { beforeEach, expect, test, vi } from 'vitest'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const hoistedMocks = vi.hoisted(() => ({
  applyRegisteredManagerActionMock: vi.fn(() => Promise.resolve('continue')),
  logLifecycleMock: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('../src/policy/manager/action-registry-definitions.js', () => ({
  applyRegisteredManagerAction: hoistedMocks.applyRegisteredManagerActionMock,
}))

vi.mock('../src/policy/manager/action-cli-log.js', () => ({
  managerActionCliLogger: {
    logLifecycle: hoistedMocks.logLifecycleMock,
  },
}))

const { applyTaskActions } =
  await import('../src/policy/manager/action-apply.js')

beforeEach(() => {
  hoistedMocks.applyRegisteredManagerActionMock.mockClear()
  hoistedMocks.logLifecycleMock.mockClear()
})

test('applyTaskActions forwards batch and round diagnostics into action lifecycle logs', async () => {
  const runtime = await createTestRuntimeState({
    runtimeId: 'runtime-manager-action-apply-diagnostics',
    patch: {
      manager: {
        threadId: 'thread-manager-1',
      },
    },
  })

  await applyTaskActions(
    runtime,
    [
      {
        type: 'enqueue_task',
        task: {
          title: 'collect diagnostics',
          cwd: '/repo/mimikit',
          mode: 'write',
          goal: 'collect diagnostics',
          in_scope: ['only diagnostics'],
          out_of_scope: [],
          done_when: ['diagnostics linked'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      triggeredPlanIds: undefined,
      batchId: 'batch-1',
      roundId: 'round-1',
    },
  )

  expect(hoistedMocks.logLifecycleMock).toHaveBeenCalledWith(
    expect.objectContaining({
      batchId: 'batch-1',
      roundId: 'round-1',
      traceId: 'thread-manager-1',
    }),
  )
})

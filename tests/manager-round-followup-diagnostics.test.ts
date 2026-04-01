import { beforeEach, expect, test, vi } from 'vitest'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const hoistedMocks = vi.hoisted(() => ({
  appendLogMock: vi.fn(() => Promise.resolve(undefined)),
  collectManagerActionValidationOutcomeMock: vi.fn(),
  logFeedbackMock: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('../src/persistence/log/append.js', () => ({
  appendLog: hoistedMocks.appendLogMock,
}))

vi.mock('../src/policy/manager/action-feedback-collect.js', () => ({
  collectManagerActionValidationOutcome:
    hoistedMocks.collectManagerActionValidationOutcomeMock,
}))

vi.mock('../src/policy/manager/action-cli-log.js', () => ({
  managerActionCliLogger: {
    logFeedback: hoistedMocks.logFeedbackMock,
  },
}))

const { resolveRoundFollowup } =
  await import('../src/policy/manager/loop-batch-round-followup.js')

beforeEach(() => {
  hoistedMocks.appendLogMock.mockClear()
  hoistedMocks.collectManagerActionValidationOutcomeMock.mockReset()
  hoistedMocks.logFeedbackMock.mockClear()
})

test('resolveRoundFollowup writes batch and round diagnostics on feedback and suppressed action logs', async () => {
  const runtime = await createTestRuntimeState({
    runtimeId: 'runtime-manager-followup-diagnostics',
  })
  const parsed = [
    {
      type: 'enqueue_task',
      task: {
        title: 'keep this action',
        cwd: '/repo/mimikit',
        mode: 'write',
        goal: 'keep this action',
        in_scope: ['keep'],
        out_of_scope: [],
        done_when: ['kept'],
        context_refs: [],
        instructions: [],
      },
    },
    {
      type: 'enqueue_task',
      task: {
        title: 'suppress this action',
        cwd: '/repo/mimikit/nested',
        mode: 'write',
        goal: 'suppress this action',
        in_scope: ['suppress'],
        out_of_scope: [],
        done_when: ['suppressed'],
        context_refs: [],
        instructions: [],
      },
    },
  ] as const

  hoistedMocks.collectManagerActionValidationOutcomeMock.mockReturnValue({
    feedback: [
      {
        action: 'enqueue_task',
        error: 'action_execution_rejected',
        hint: 'need current user intent evidence',
        attempted: JSON.stringify(parsed[0]),
      },
    ],
    suppressedActionIndexes: [1],
  })

  const result = await resolveRoundFollowup({
    runtime,
    batchId: 'batch-1',
    roundId: 'round-1',
    parsed: [...parsed],
    output: 'follow up',
    allowAskUserChoice: true,
    resultTaskIds: new Set<string>(),
    wakeProfile: 'mixed',
  })

  expect(hoistedMocks.logFeedbackMock).toHaveBeenCalledWith(
    expect.objectContaining({
      batchId: 'batch-1',
      roundId: 'round-1',
    }),
  )
  expect(hoistedMocks.appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'manager_action_feedback',
      batchId: 'batch-1',
      roundId: 'round-1',
    }),
  )
  expect(hoistedMocks.appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'manager_action_suppressed',
      batchId: 'batch-1',
      roundId: 'round-1',
    }),
  )
  expect(result).toMatchObject({
    done: false,
    filteredActions: [parsed[0]],
  })
})

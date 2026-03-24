import { beforeEach, expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { buildPaths } from '../src/persistence/fs/paths.js'
import { runManagerCorrectionRounds } from '../src/policy/manager/loop-batch-run-rounds.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const { runManagerRoundWithRecoveryMock } = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

const { resolveRoundFollowupMock } = vi.hoisted(() => ({
  resolveRoundFollowupMock: vi.fn(),
}))

const { appendLogMock } = vi.hoisted(() => ({
  appendLogMock: vi.fn(async () => undefined),
}))

vi.mock('../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: runManagerRoundWithRecoveryMock,
}))

vi.mock('../src/persistence/log/append.js', () => ({
  appendLog: appendLogMock,
}))

vi.mock('../src/policy/manager/loop-batch-round-followup.js', () => ({
  resolveRoundFollowup: resolveRoundFollowupMock,
}))

beforeEach(() => {
  runManagerRoundWithRecoveryMock.mockReset()
  appendLogMock.mockClear()
  resolveRoundFollowupMock.mockReset()
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      lookupKey: 'q1',
      extra: {},
    })
    .mockResolvedValueOnce({
      done: true,
    })
})

test('runManagerCorrectionRounds reuses and updates manager thread id across rounds', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce({
      output: 'first round output',
      elapsedMs: 3,
      promptPrefixHash: 'prefix-hash',
      threadId: 'session-manager-1',
    })
    .mockResolvedValueOnce({
      output: 'final answer',
      elapsedMs: 4,
      promptPrefixHash: 'prefix-hash',
      threadId: 'session-manager-1',
    })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: '继续',
        createdAt: '2026-03-08T00:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 3,
    resolveFocusId: () => 'focus-global',
  })

  expect(result.parsed.text).toBe('final answer')
  expect(runManagerRoundWithRecoveryMock).toHaveBeenCalledTimes(2)
  expect(runManagerRoundWithRecoveryMock.mock.calls[0]?.[0]).not.toHaveProperty(
    'managerThreadId',
  )
  expect(runManagerRoundWithRecoveryMock.mock.calls[1]?.[0]).toMatchObject({
    managerThreadId: 'session-manager-1',
  })
  expect(runtime.manager.threadId).toBe('session-manager-1')
})

test('runManagerCorrectionRounds opens rejection circuit after repeated rejected actions', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce({
      output: '<M:mutate_task id="task-1" op="cancel" />',
      elapsedMs: 3,
      promptPrefixHash: 'prefix-hash',
      threadId: 'session-manager-reject',
    })
    .mockResolvedValueOnce({
      output: '<M:mutate_task id="task-1" op="cancel" />',
      elapsedMs: 4,
      promptPrefixHash: 'prefix-hash',
      threadId: 'session-manager-reject',
    })
  resolveRoundFollowupMock.mockReset()
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'mutate_task',
            error: 'action_execution_rejected',
            hint: 'task already canceled',
          },
          {
            action: 'mutate_task',
            error: 'action_execution_rejected',
            hint: 'task already canceled',
          },
        ],
      },
    })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-reject-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-reject-1',
        role: 'user',
        text: '取消已经取消的任务',
        createdAt: '2026-03-08T00:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 3,
    resolveFocusId: () => 'focus-global',
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('同类动作 mutate_task 已连续被拒绝')
  expect(runManagerRoundWithRecoveryMock).toHaveBeenCalledTimes(1)
  expect(appendLogMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      event: 'manager_action_rejection_circuit_open',
      round: 2,
      action: 'mutate_task',
    }),
  )
})

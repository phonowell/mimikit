import { beforeEach, expect, test, vi } from 'vitest'

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
})

test('runManagerCorrectionRounds gives invalid action feedback one self-repair retry before degrading', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce({
      output:
        '<M:create_plan prompt="daily" title="plan" cron_expr="*/15 * * * *" time_zone="Asia/Shanghai" />',
      elapsedMs: 3,
      wakeProfile: 'user_input',
      threadId: 'session-manager-self-repair',
    })
    .mockResolvedValueOnce({
      output: 'repaired answer',
      elapsedMs: 4,
      wakeProfile: 'user_input',
      threadId: 'session-manager-self-repair',
    })
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'create_plan',
            error: 'invalid_action_args',
            hint:
              '参数校验失败：schedule_type: schedule_type is required when cron_expr/scheduled_at/time_zone is provided',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: [
                'schedule_type: schedule_type is required when cron_expr/scheduled_at/time_zone is provided',
              ],
            },
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      done: true,
    })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-self-repair-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-self-repair-1',
        role: 'user',
        text: '继续处理',
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

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('repaired answer')
  expect(runManagerRoundWithRecoveryMock).toHaveBeenCalledTimes(2)
  expect(appendLogMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      event: 'manager_action_feedback_self_repair_retry',
      round: 2,
    }),
  )
})

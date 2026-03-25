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

test('runManagerCorrectionRounds summarizes repeated invalid create_plan feedback instead of asking for scope details', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce({
      output: '<M:create_plan title="bad plan" />',
      elapsedMs: 3,
      wakeProfile: 'user_input',
      threadId: 'session-manager-invalid-plan',
    })
    .mockResolvedValueOnce({
      output: '<M:create_plan title="bad plan" />',
      elapsedMs: 4,
      wakeProfile: 'user_input',
      threadId: 'session-manager-invalid-plan',
    })
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'create_plan',
            error: 'invalid_action_syntax',
            hint:
              'Detected M:action markup but no executable action was parsed. Put valid XML actions at the end of the reply.',
            code: 'invalid_action_syntax',
            repair: { kind: 'fix_action_markup' },
          },
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
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'create_plan',
            error: 'invalid_action_syntax',
            hint:
              'Detected M:action markup but no executable action was parsed. Put valid XML actions at the end of the reply.',
            code: 'invalid_action_syntax',
            repair: { kind: 'fix_action_markup' },
          },
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

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-invalid-plan-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-invalid-plan-1',
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

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('当前 create_plan 动作无法继续执行')
  expect(result.parsed.text).toContain('Detected M:action markup')
  expect(result.parsed.text).toContain('schedule_type is required')
  expect(result.parsed.text).not.toContain('最终要我产出什么')
})

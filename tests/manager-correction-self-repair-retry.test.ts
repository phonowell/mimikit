import { expect, test } from 'vitest'

import {
  appendLogMock,
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

test('runManagerCorrectionRounds gives invalid action feedback one self-repair retry before degrading', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'bad plan',
        actions: [
          {
            type: 'set_plan',
            plan_id: null,
            plan: {
              title: 'plan',
              trigger: {
                type: 'cron',
                cron: '*/15 * * * *',
                time_zone: 'Asia/Shanghai',
              },
              task: {
                title: 'daily',
                cwd: '/tmp/task',
                mode: 'read',
                goal: 'summarize',
                in_scope: ['daily summary'],
                out_of_scope: [],
                done_when: ['summary written'],
                context_refs: [],
                instructions: [],
              },
              priority: 'normal',
              max_runs: 1,
            },
          },
        ],
        threadId: 'session-manager-self-repair',
      }),
    )
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'repaired answer',
        elapsedMs: 4,
        threadId: 'session-manager-self-repair',
      }),
    )
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'set_plan',
            error: 'invalid_action_args',
            hint: '参数校验失败：plan.trigger.cron: Invalid cron expression',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: ['plan.trigger.cron: Invalid cron expression'],
            },
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      done: true,
    })

  const runtime = await createCorrectionRuntime('self-repair')

  const result = await runCorrectionRounds({ runtime })

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

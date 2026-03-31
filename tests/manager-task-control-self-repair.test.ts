import { expect, test } from 'vitest'

import {
  appendLogMock,
  buildCorrectionInput,
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

test('runManagerCorrectionRounds gives task_control invalid instructions one self-repair retry', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'bad task control',
        actions: [
          {
            type: 'task_control',
            task_id: 'task-123',
            action: 'cancel',
            instructions: ['stop this task'],
          },
        ],
        threadId: 'session-manager-task-control-repair',
      }),
    )
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'repaired task control',
        elapsedMs: 4,
        threadId: 'session-manager-task-control-repair',
      }),
    )
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'task_control',
            error: 'invalid_action_args',
            hint: '参数校验失败：instructions: 只有 action="resume" 才允许附带 instructions[]（task_id=task-123）',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: [
                'instructions: 只有 action="resume" 才允许附带 instructions[]（task_id=task-123）',
              ],
            },
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      done: true,
    })

  const runtime = await createCorrectionRuntime('task-control-self-repair')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [buildCorrectionInput({ id: 'input-task-control-repair-1' })],
  })

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('repaired task control')
  expect(runManagerRoundWithRecoveryMock).toHaveBeenCalledTimes(2)
  expect(appendLogMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      event: 'manager_action_feedback_self_repair_retry',
      round: 2,
      names: ['task_control'],
    }),
  )
})

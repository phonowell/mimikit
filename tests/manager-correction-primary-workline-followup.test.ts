import { expect, test } from 'vitest'

import {
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

test('runManagerCorrectionRounds passes the batch primary workline into follow-up validation', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce(
    buildRoundResult({
      output: '继续推进当前主线。',
      actions: [
        {
          type: 'enqueue_task',
          task: {
            title: '继续推进 auth guard 主线',
            cwd: '/repo/auth-guard',
            mode: 'write',
            use_worktree: false,
            goal: '沿当前鉴权链路继续推进 auth guard 主线',
            in_scope: ['只处理 auth guard 主线'],
            out_of_scope: [],
            done_when: ['auth guard 主线完成'],
            context_refs: [],
            instructions: [],
          },
        },
      ],
      wakeProfile: 'task_result',
      threadId: 'session-manager-primary-followup',
    }),
  )

  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: true,
  })

  const runtime = await createCorrectionRuntime('primary-followup')

  await runCorrectionRounds({
    runtime,
    inputs: [],
    results: [
      {
        taskId: 'task-finished-auth-guard-primary',
        status: 'succeeded',
        ok: true,
        output: '当前子步已完成。',
        durationMs: 12,
        completedAt: '2026-04-15T00:00:00.000Z',
        stopReason: 'completed',
      },
    ],
    workingFocusIds: ['focus-auth-guard', 'focus-inbox'],
    maxCorrectionRounds: 2,
  })

  expect(resolveRoundFollowupMock).toHaveBeenCalledWith(
    expect.objectContaining({
      defaultFocusId: 'focus-auth-guard',
    }),
  )
})

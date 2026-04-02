import { beforeEach, expect, test } from 'vitest'

import {
  appendLogMock,
  buildCorrectionInput,
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

beforeEach(() => {
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
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'first round output',
        threadId: 'session-manager-1',
      }),
    )
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'final answer',
        elapsedMs: 4,
        threadId: 'session-manager-1',
      }),
    )

  const runtime = await createCorrectionRuntime('thread-cache')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [buildCorrectionInput({ id: 'input-1', text: '继续' })],
  })

  expect(result.parsed.text).toBe('final answer')
  expect(runManagerRoundWithRecoveryMock).toHaveBeenCalledTimes(2)
  expect(runManagerRoundWithRecoveryMock.mock.calls[0]?.[0]).not.toHaveProperty(
    'managerThreadId',
  )
  expect(runManagerRoundWithRecoveryMock.mock.calls[1]?.[0]).toMatchObject({
    managerThreadId: 'session-manager-1',
  })
  expect(runtime.process.manager.threadId).toBe('session-manager-1')
})

test('runManagerCorrectionRounds opens rejection circuit after repeated rejected actions', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'cancel task',
        actions: [
          {
            type: 'task_control',
            task_id: 'task-1',
            action: 'cancel',
            instructions: [],
          },
        ],
        threadId: 'session-manager-reject',
      }),
    )
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'cancel task',
        actions: [
          {
            type: 'task_control',
            task_id: 'task-1',
            action: 'cancel',
            instructions: [],
          },
        ],
        elapsedMs: 4,
        threadId: 'session-manager-reject',
      }),
    )
  resolveRoundFollowupMock.mockReset()
  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: false,
    extra: {
      actionFeedback: [
        {
          action: 'task_control',
          error: 'action_execution_rejected',
          hint: 'task already canceled',
        },
        {
          action: 'task_control',
          error: 'action_execution_rejected',
          hint: 'task already canceled',
        },
      ],
    },
  })

  const runtime = await createCorrectionRuntime('thread-cache-reject')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [
      buildCorrectionInput({
        id: 'input-reject-1',
        text: '取消已经取消的任务',
      }),
    ],
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('当前 task_control 动作无法继续执行')
  expect(result.parsed.text).toContain('task already canceled')
  expect(runManagerRoundWithRecoveryMock).toHaveBeenCalledTimes(1)
  expect(appendLogMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      event: 'manager_correction_structured_clarify',
      round: 2,
      names: ['task_control', 'task_control'],
    }),
  )
})

import { expect, test } from 'vitest'

import {
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

test('runManagerCorrectionRounds uses structured round actions instead of reparsing output text', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce(
    buildRoundResult({
      output: '结构化答复',
      actions: [
        {
          type: 'assign_focus',
          target_type: 'task',
          target_id: 'task-json-turn',
          focus_id: 'focus-json-turn',
        },
      ],
      threadId: 'session-manager-json-turn',
    }),
  )

  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: true,
  })

  const runtime = await createCorrectionRuntime('json-turn')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-manager-json-turn',
        role: 'user',
        text: '继续迁移',
        createdAt: '2026-03-26T00:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    maxCorrectionRounds: 2,
  })

  expect(resolveRoundFollowupMock).toHaveBeenCalledWith(
    expect.objectContaining({
      parsed: [
        {
          type: 'assign_focus',
          target_type: 'task',
          target_id: 'task-json-turn',
          focus_id: 'focus-json-turn',
        },
      ],
    }),
  )
  expect(result.parsed.text).toBe('结构化答复')
  expect(result.parsed.actions).toEqual([
    {
      type: 'assign_focus',
      target_type: 'task',
      target_id: 'task-json-turn',
      focus_id: 'focus-json-turn',
    },
  ])
})

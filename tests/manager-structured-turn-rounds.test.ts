import { beforeEach, expect, test, vi } from 'vitest'

import { runManagerCorrectionRounds } from '../src/policy/manager/loop-batch-run-rounds.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const { runManagerRoundWithRecoveryMock } = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

const { resolveRoundFollowupMock } = vi.hoisted(() => ({
  resolveRoundFollowupMock: vi.fn(),
}))

vi.mock('../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: runManagerRoundWithRecoveryMock,
}))

vi.mock('../src/policy/manager/loop-batch-round-followup.js', () => ({
  resolveRoundFollowup: resolveRoundFollowupMock,
}))

beforeEach(() => {
  runManagerRoundWithRecoveryMock.mockReset()
  resolveRoundFollowupMock.mockReset()
})

test('runManagerCorrectionRounds uses structured round actions instead of reparsing output text', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output: '结构化答复',
    actions: [
      {
        name: 'upsert_focus',
        attrs: {
          id: 'focus-json-turn',
          title: 'JSON turn',
        },
      },
    ],
    elapsedMs: 3,
    wakeProfile: 'user_input',
    threadId: 'session-manager-json-turn',
  })

  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: true,
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-json-turn-rounds-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
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
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 2,
  })

  expect(resolveRoundFollowupMock).toHaveBeenCalledWith(
    expect.objectContaining({
      parsed: [
        {
          name: 'upsert_focus',
          attrs: {
            id: 'focus-json-turn',
            title: 'JSON turn',
          },
        },
      ],
    }),
  )
  expect(result.parsed.text).toBe('结构化答复')
  expect(result.parsed.actions).toEqual([
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-json-turn',
        title: 'JSON turn',
      },
    },
  ])
})

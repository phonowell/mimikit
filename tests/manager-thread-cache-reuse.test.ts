import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { runManagerCorrectionRounds } from '../src/manager/loop-batch-run-rounds.js'

const { runManagerRoundWithRecoveryMock } = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

vi.mock('../src/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: runManagerRoundWithRecoveryMock,
}))
vi.mock('../src/manager/loop-batch-round-followup.js', () => ({
  resolveRoundFollowup: vi
    .fn()
    .mockResolvedValueOnce({
      done: false,
      lookupKey: 'q1',
      extra: {},
    })
    .mockResolvedValueOnce({
      done: true,
    }),
}))

test('runManagerCorrectionRounds reuses and updates manager thread id across rounds', async () => {
  runManagerRoundWithRecoveryMock.mockReset()
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

  const runtime = {
    managerThreadId: undefined,
    lastUserMeta: undefined,
    paths: buildPaths('/tmp/mimikit-manager-thread-cache-test'),
    tasks: [],
    taskPlans: [],
    config: defaultConfig({ workDir: '/tmp/mimikit-manager-thread-cache-test' }),
  } as any

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
  expect(runtime.managerThreadId).toBe('session-manager-1')
})

import { beforeEach, expect, test, vi } from 'vitest'

import { appendHistory } from '../src/persistence/history/store.js'
import { runManagerCorrectionRounds } from '../src/policy/manager/loop-batch-run-rounds.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const { runManagerRoundWithRecoveryMock } = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

vi.mock('../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: runManagerRoundWithRecoveryMock,
}))

beforeEach(() => {
  runManagerRoundWithRecoveryMock.mockReset()
})

test('runManagerCorrectionRounds silently suppresses unsupported remember_memory actions', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '收到。\n<M:remember_memory content="Always keep replies concise and in Chinese." />',
    elapsedMs: 3,
    wakeProfile: 'user_input',
    threadId: 'session-remember-memory-suppressed',
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-remember-memory-suppressed-test',
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-user',
        role: 'user',
        text: '先总结一下当前实现状态。',
        createdAt: '2026-03-26T07:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 3,
  })

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('收到。')
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds keeps remember_memory when repeated user history supports it', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '收到。\n<M:remember_memory content="Always keep replies concise and in Chinese." />',
    elapsedMs: 3,
    wakeProfile: 'user_input',
    threadId: 'session-remember-memory-repeated',
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-remember-memory-repeated-test',
  })

  await appendHistory(runtime.paths.history, {
    id: 'input-history-1',
    role: 'user',
    text: 'Always keep replies concise and in Chinese.',
    createdAt: '2026-03-25T07:00:00.000Z',
    focusId: 'focus-global',
  })
  await appendHistory(runtime.paths.history, {
    id: 'input-history-2',
    role: 'user',
    text: 'Always keep replies concise and in Chinese.',
    createdAt: '2026-03-25T07:05:00.000Z',
    focusId: 'focus-global',
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-user',
        role: 'user',
        text: '继续。',
        createdAt: '2026-03-26T07:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 3,
  })

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('收到。')
  expect(result.parsed.actions).toHaveLength(1)
  expect(result.parsed.actions[0]).toMatchObject({
    name: 'remember_memory',
    attrs: {
      content: 'Always keep replies concise and in Chinese.',
    },
  })
})

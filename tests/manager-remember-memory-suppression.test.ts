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
  expect(result.parsed.text).toBe(
    '这条规则当前没有写入长期记忆，我不会把它当作已记住处理。',
  )
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds does not claim remember_memory succeeded after suppression', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '我现在把这条规则写入长期记忆。\n<M:remember_memory content="Always keep replies concise and in Chinese." />',
    elapsedMs: 3,
    wakeProfile: 'user_input',
    threadId: 'session-remember-memory-suppressed-claim',
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-remember-memory-suppressed-claim-test',
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
  expect(result.parsed.text).toBe(
    '这条规则当前没有写入长期记忆，我不会把它当作已记住处理。',
  )
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds does not keep remember_memory success claims when correction rounds stop on failure', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '我现在把这条规则写入长期记忆。\n<M:remember_memory content="Always keep replies concise and in Chinese.">',
    elapsedMs: 3,
    wakeProfile: 'user_input',
    threadId: 'session-remember-memory-failed-claim',
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-remember-memory-failed-claim-test',
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-user',
        role: 'user',
        text: '后续都按这个规则执行。',
        createdAt: '2026-03-26T07:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 1,
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('remember_memory 动作无法继续执行')
  expect(result.parsed.text).not.toContain('我现在把这条规则写入长期记忆')
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds preserves non-memory reply text when remember_memory is suppressed alongside another action', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '我会安排一个任务继续处理。\n<M:enqueue_task title="继续处理当前问题" cwd="/tmp/task" goal="继续处理当前问题" in_scope="只处理当前问题" done_when_1="给出结果" />\n<M:remember_memory content="Always keep replies concise and in Chinese." />',
    elapsedMs: 3,
    wakeProfile: 'user_input',
    threadId: 'session-remember-memory-suppressed-mixed',
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-remember-memory-suppressed-mixed-test',
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-user',
        role: 'user',
        text: '继续处理当前问题。',
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
  expect(result.parsed.text).toBe('我会安排一个任务继续处理。')
  expect(result.parsed.actions).toHaveLength(1)
  expect(result.parsed.actions[0]).toMatchObject({
    name: 'enqueue_task',
  })
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

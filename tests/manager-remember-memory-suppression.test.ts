import { beforeEach, expect, test } from 'vitest'

import {
  createRememberMemoryRuntime,
  mockRememberMemoryRound,
  rememberMemoryContent,
  resetRememberMemoryMocks,
  runRememberMemoryRound,
} from './manager-remember-memory-suppression/testkit.js'

beforeEach(() => {
  resetRememberMemoryMocks()
})

test('runManagerCorrectionRounds silently suppresses unsupported remember_memory actions', async () => {
  mockRememberMemoryRound(
    '收到。',
    'session-remember-memory-suppressed',
    [
      {
        name: 'remember_memory',
        attrs: {
          content: rememberMemoryContent,
        },
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-remember-memory-suppressed-test',
  )

  const result = await runRememberMemoryRound(
    runtime,
    '先总结一下当前实现状态。',
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe(
    '这条规则当前没有写入长期记忆，我不会把它当作已记住处理。',
  )
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds does not claim remember_memory succeeded after suppression', async () => {
  mockRememberMemoryRound(
    '我现在把这条规则写入长期记忆。',
    'session-remember-memory-suppressed-claim',
    [
      {
        name: 'remember_memory',
        attrs: {
          content: rememberMemoryContent,
        },
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-remember-memory-suppressed-claim-test',
  )

  const result = await runRememberMemoryRound(
    runtime,
    '先总结一下当前实现状态。',
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe(
    '这条规则当前没有写入长期记忆，我不会把它当作已记住处理。',
  )
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds does not keep remember_memory success claims after structured suppression', async () => {
  mockRememberMemoryRound(
    '我现在把这条规则写入长期记忆。',
    'session-remember-memory-failed-claim',
    [
      {
        name: 'remember_memory',
        attrs: {
          content: rememberMemoryContent,
        },
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-remember-memory-failed-claim-test',
  )

  const result = await runRememberMemoryRound(
    runtime,
    '后续都按这个规则执行。',
    1,
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe(
    '这条规则当前没有写入长期记忆，我不会把它当作已记住处理。',
  )
  expect(result.parsed.text).not.toContain('我现在把这条规则写入长期记忆')
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds preserves non-memory reply text when remember_memory is suppressed alongside another action', async () => {
  mockRememberMemoryRound(
    '我会安排一个任务继续处理。',
    'session-remember-memory-suppressed-mixed',
    [
      {
        name: 'enqueue_task',
        attrs: {
          title: '继续处理当前问题',
          cwd: '/tmp/task',
          goal: '继续处理当前问题',
          in_scope: '只处理当前问题',
          done_when_1: '给出结果',
        },
      },
      {
        name: 'remember_memory',
        attrs: {
          content: rememberMemoryContent,
        },
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-remember-memory-suppressed-mixed-test',
  )

  const result = await runRememberMemoryRound(runtime, '继续处理当前问题。')

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('我会安排一个任务继续处理。')
  expect(result.parsed.actions).toHaveLength(1)
  expect(result.parsed.actions[0]).toMatchObject({
    name: 'enqueue_task',
  })
})

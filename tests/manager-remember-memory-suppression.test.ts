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
        type: 'remember_memory',
        content: rememberMemoryContent,
        source_input_id: 'input-user',
        source_quote: '后续都请保持中文且简洁回复',
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
  expect(result.parsed.text).toBe('收到。')
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds does not claim remember_memory succeeded after suppression', async () => {
  mockRememberMemoryRound(
    '我现在把这条规则写入长期记忆。',
    'session-remember-memory-suppressed-claim',
    [
      {
        type: 'remember_memory',
        content: rememberMemoryContent,
        source_input_id: 'input-user',
        source_quote: '后续都请保持中文且简洁回复',
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
  expect(result.parsed.text).toBe('收到。')
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds does not keep remember_memory success claims after structured suppression', async () => {
  mockRememberMemoryRound(
    '我现在把这条规则写入长期记忆。',
    'session-remember-memory-failed-claim',
    [
      {
        type: 'remember_memory',
        content: rememberMemoryContent,
        source_input_id: 'input-user',
        source_quote: '后续都按这个规则执行',
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
  expect(result.parsed.text).toBe('收到。')
  expect(result.parsed.actions).toHaveLength(0)
})

test('runManagerCorrectionRounds preserves non-memory reply text when remember_memory is suppressed alongside another action', async () => {
  mockRememberMemoryRound(
    '我会安排一个任务继续处理。',
    'session-remember-memory-suppressed-mixed',
    [
      {
        type: 'enqueue_task',
        task: {
          title: '继续处理当前问题',
          cwd: '/tmp/task',
          mode: 'write',
          goal: '继续处理当前问题',
          in_scope: ['只处理当前问题'],
          out_of_scope: [],
          done_when: ['给出结果'],
          context_refs: [],
          instructions: [],
        },
      },
      {
        type: 'remember_memory',
        content: rememberMemoryContent,
        source_input_id: 'input-user',
        source_quote: '后续都请保持中文且简洁回复',
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
    type: 'enqueue_task',
  })
})

test('runManagerCorrectionRounds uses neutral reply when remember_project_profile is fully suppressed', async () => {
  mockRememberMemoryRound(
    '我现在把这条仓库规则写入项目档案。',
    'session-project-profile-suppressed-claim',
    [
      {
        type: 'remember_project_profile',
        content: '当前阶段先只收敛 manager，不动 worker。',
        source_input_id: 'input-user',
        source_quote: '先只收敛 manager，不动 worker',
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-project-profile-suppressed-claim-test',
  )

  const result = await runRememberMemoryRound(
    runtime,
    '先总结一下当前实现状态。',
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('收到。')
  expect(result.parsed.actions).toHaveLength(0)
})

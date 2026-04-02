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

test('runManagerCorrectionRounds keeps remember_memory actions when current input provenance is valid', async () => {
  mockRememberMemoryRound(
    '我会记住这条规则。',
    'session-remember-memory-kept',
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
    '后续都请保持中文且简洁回复。',
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('我会记住这条规则。')
  expect(result.parsed.actions).toHaveLength(1)
  expect(result.parsed.actions[0]).toMatchObject({
    type: 'remember_memory',
  })
})

test('runManagerCorrectionRounds does not rewrite remember_memory success claims into neutral reply', async () => {
  mockRememberMemoryRound(
    '我现在把这条规则写入长期记忆。',
    'session-remember-memory-claim-kept',
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
    '后续都请保持中文且简洁回复。',
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('我现在把这条规则写入长期记忆。')
  expect(result.parsed.actions).toHaveLength(1)
})

test('runManagerCorrectionRounds keeps remember_memory action when content is normalized from anchored source quote', async () => {
  mockRememberMemoryRound(
    '我现在把这条规则写入长期记忆。',
    'session-remember-memory-normalized-claim',
    [
      {
        type: 'remember_memory',
        content: 'Always keep replies concise.',
        source_input_id: 'input-user',
        source_quote: '后续都请保持回复简洁',
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-remember-memory-failed-claim-test',
  )

  const result = await runRememberMemoryRound(
    runtime,
    '后续都请保持回复简洁，不要展开成长篇大论。',
    1,
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('我现在把这条规则写入长期记忆。')
  expect(result.parsed.actions).toHaveLength(1)
})

test('runManagerCorrectionRounds preserves non-memory reply text when remember_memory is kept alongside another action', async () => {
  mockRememberMemoryRound(
    '我会安排一个任务继续处理。',
    'session-remember-memory-kept-mixed',
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

  const result = await runRememberMemoryRound(
    runtime,
    '继续处理当前问题。后续都请保持中文且简洁回复。',
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('我会安排一个任务继续处理。')
  expect(result.parsed.actions).toHaveLength(2)
  expect(result.parsed.actions[0]).toMatchObject({
    type: 'enqueue_task',
  })
  expect(result.parsed.actions[1]).toMatchObject({
    type: 'remember_memory',
  })
})

test('runManagerCorrectionRounds keeps remember_project_profile reply and action when current input provenance is valid', async () => {
  mockRememberMemoryRound(
    '我现在把这条仓库规则写入项目档案。',
    'session-project-profile-kept-claim',
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
    '先只收敛 manager，不动 worker。',
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('我现在把这条仓库规则写入项目档案。')
  expect(result.parsed.actions).toHaveLength(1)
  expect(result.parsed.actions[0]).toMatchObject({
    type: 'remember_project_profile',
  })
})

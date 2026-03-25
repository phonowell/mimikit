import { beforeEach, expect, test, vi } from 'vitest'

import { runManagerCorrectionRounds } from '../src/policy/manager/loop-batch-run-rounds.js'
import { TASK_CONTRACT_REQUIRED_HINT } from '../src/policy/manager/task-contract.js'
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

test('runManagerCorrectionRounds explains missing execution boundary in user terms', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '<M:enqueue_task worker_prompt="do work" title="task" cwd="/tmp/task" />',
    elapsedMs: 3,
    wakeProfile: 'user_input',
    threadId: 'session-manager-scope',
  })
  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: false,
    extra: {
      actionFeedback: [
        {
          action: 'enqueue_task',
          error: 'action_execution_rejected',
          hint: TASK_CONTRACT_REQUIRED_HINT,
          code: 'task_contract_missing',
        },
      ],
    },
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-scope-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-scope-1',
        role: 'user',
        text: '继续处理',
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

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('enqueue_task 动作无法继续执行')
  expect(result.parsed.text).toContain('goal')
  expect(result.parsed.text).toContain('done_when_{n}')
  expect(result.parsed.text).toContain('继续派发前还缺 3 个最小信息')
})

test('runManagerCorrectionRounds returns concrete invalid action args instead of generic scope clarification', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce({
      output:
        '<M:enqueue_task title="task" cwd="/tmp/task" goal="ship" in_scope="frontend only" done_when_1="tests pass" />',
      elapsedMs: 3,
      wakeProfile: 'user_input',
      threadId: 'session-manager-invalid-args',
    })
    .mockResolvedValueOnce({
      output:
        '<M:enqueue_task title="task" cwd="/tmp/task" goal="ship" in_scope="frontend only" done_when_1="tests pass" />',
      elapsedMs: 4,
      wakeProfile: 'user_input',
      threadId: 'session-manager-invalid-args',
    })
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'enqueue_task',
            error: 'invalid_action_args',
            hint:
              '参数校验失败：worker_prompt: Invalid input: expected string, received undefined',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: [
                'worker_prompt: Invalid input: expected string, received undefined',
              ],
              missing_required_attr: 'worker_prompt',
              missing_required_attrs: ['worker_prompt'],
            },
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'enqueue_task',
            error: 'invalid_action_args',
            hint:
              '参数校验失败：worker_prompt: Invalid input: expected string, received undefined',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: [
                'worker_prompt: Invalid input: expected string, received undefined',
              ],
              missing_required_attr: 'worker_prompt',
              missing_required_attrs: ['worker_prompt'],
            },
          },
        ],
      },
    })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-invalid-args-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-invalid-args-1',
        role: 'user',
        text: '继续处理',
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

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('当前 enqueue_task 动作无法继续执行')
  expect(result.parsed.text).toContain('worker_prompt: Invalid input')
  expect(result.parsed.text).not.toContain('goal（最终要什么结果）')
})

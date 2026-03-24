import { beforeEach, expect, test, vi } from 'vitest'

import { formatEnqueueTaskIntentEvidenceHint } from '../src/policy/manager/action-evidence-hints.js'
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
    promptPrefixHash: 'prefix-hash',
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
  expect(result.parsed.text).toContain('每项一句即可')
  expect(result.parsed.text).toContain('最终要我产出什么')
  expect(result.parsed.text).toContain('哪些不要动')
  expect(result.parsed.text).toContain('最小可交付结果')
})

test('runManagerCorrectionRounds returns concrete invalid action args instead of generic scope clarification', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce({
      output:
        '<M:enqueue_task title="task" cwd="/tmp/task" goal="ship" in_scope="frontend only" done_when_1="tests pass" />',
      elapsedMs: 3,
      promptPrefixHash: 'prefix-hash',
      threadId: 'session-manager-invalid-args',
    })
    .mockResolvedValueOnce({
      output:
        '<M:enqueue_task title="task" cwd="/tmp/task" goal="ship" in_scope="frontend only" done_when_1="tests pass" />',
      elapsedMs: 4,
      promptPrefixHash: 'prefix-hash',
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
  expect(result.parsed.text).toContain('当前动作无法继续执行')
  expect(result.parsed.text).toContain('worker_prompt: Invalid input')
  expect(result.parsed.text).not.toContain('继续执行前还缺 3 个最小信息')
})

test('runManagerCorrectionRounds explains insufficient evidence for risky actions', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '<M:enqueue_task title="task" cwd="/tmp/task" goal="ship" in_scope="guard only" done_when_1="tests pass" />',
    elapsedMs: 3,
    promptPrefixHash: 'prefix-hash',
    threadId: 'session-manager-evidence',
  })
  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: false,
    extra: {
      actionFeedback: [
        {
          action: 'enqueue_task',
          error: 'action_execution_rejected',
          hint: formatEnqueueTaskIntentEvidenceHint('task_result'),
        },
      ],
    },
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-evidence-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 3,
    resolveFocusId: () => 'focus-global',
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('缺少可核实证据')
  expect(result.parsed.text).toContain('直接向用户确认')
})

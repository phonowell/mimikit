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

const buildInvalidArgsRunResult = (elapsedMs: number) => ({
  output: 'invalid enqueue task',
  actions: [
    {
      type: 'enqueue_task',
      task: {
        title: 'task',
        cwd: '/tmp/task',
        mode: 'write',
        goal: 'ship',
        in_scope: ['frontend only'],
        out_of_scope: [],
        done_when: ['tests pass'],
        context_refs: [],
        instructions: [],
        provider: 'codex',
      },
    },
  ],
  elapsedMs,
  wakeProfile: 'user_input' as const,
  threadId: 'session-manager-invalid-args',
})

const invalidProviderFeedback = {
  action: 'enqueue_task',
  error: 'invalid_action_args',
  hint: '参数校验失败：task: Unrecognized key: "provider"',
  code: 'invalid_action_args' as const,
  repair: {
    kind: 'fix_action_args' as const,
    issues: ['task: Unrecognized key: "provider"'],
  },
}

test('runManagerCorrectionRounds explains missing execution boundary in user terms', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output: 'missing task contract',
    actions: [
      {
        type: 'enqueue_task',
        task: {
          title: 'task',
          cwd: '/tmp/task',
          mode: 'write',
          goal: 'ship',
          in_scope: ['frontend only'],
          out_of_scope: [],
          done_when: ['tests pass'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
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
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('enqueue_task 动作无法继续执行')
  expect(result.parsed.text).toContain('goal')
  expect(result.parsed.text).toContain('in_scope')
  expect(result.parsed.text).toContain('done_when')
  expect(result.parsed.text).toContain('cwd/mode')
})

test('runManagerCorrectionRounds returns concrete invalid action args instead of generic scope clarification', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce(buildInvalidArgsRunResult(3))
    .mockResolvedValueOnce(buildInvalidArgsRunResult(4))
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [invalidProviderFeedback],
      },
    })
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [invalidProviderFeedback],
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
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('当前 enqueue_task 动作无法继续执行')
  expect(result.parsed.text).toContain('provider')
  expect(result.parsed.text).not.toContain('goal（最终要什么结果）')
})

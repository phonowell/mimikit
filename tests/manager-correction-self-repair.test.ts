import { beforeEach, expect, test, vi } from 'vitest'

import { runManagerCorrectionRounds } from '../src/policy/manager/loop-batch-run-rounds.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const { runManagerRoundWithRecoveryMock } = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

const { resolveRoundFollowupMock } = vi.hoisted(() => ({
  resolveRoundFollowupMock: vi.fn(),
}))

const { appendLogMock } = vi.hoisted(() => ({
  appendLogMock: vi.fn(async () => undefined),
}))

vi.mock('../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: runManagerRoundWithRecoveryMock,
}))

vi.mock('../src/persistence/log/append.js', () => ({
  appendLog: appendLogMock,
}))

vi.mock('../src/policy/manager/loop-batch-round-followup.js', () => ({
  resolveRoundFollowup: resolveRoundFollowupMock,
}))

beforeEach(() => {
  runManagerRoundWithRecoveryMock.mockReset()
  appendLogMock.mockClear()
  resolveRoundFollowupMock.mockReset()
})

const invalidPlanAction = {
  type: 'set_plan' as const,
  plan_id: null,
  plan: {
    title: 'bad plan',
    trigger: {
      type: 'on_worker_slot_freed' as const,
    },
    task: {
      title: 'bad task',
      cwd: '/tmp/task',
      mode: 'write' as const,
      goal: 'ship',
      in_scope: ['frontend only'],
      out_of_scope: [],
      done_when: ['tests pass'],
      context_refs: [],
      instructions: [],
    },
    priority: 'normal' as const,
    max_runs: 1,
  },
}

test('runManagerCorrectionRounds summarizes repeated invalid set_plan feedback instead of asking for scope details', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce({
      output: 'bad plan',
      actions: [invalidPlanAction],
      elapsedMs: 3,
      wakeProfile: 'user_input',
      threadId: 'session-manager-invalid-plan',
    })
    .mockResolvedValueOnce({
      output: 'bad plan',
      actions: [invalidPlanAction],
      elapsedMs: 4,
      wakeProfile: 'user_input',
      threadId: 'session-manager-invalid-plan',
    })
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'set_plan',
            error: 'invalid_action_args',
            hint: '参数校验失败：plan.trigger: Invalid input',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: ['plan.trigger: Invalid input'],
            },
          },
          {
            action: 'set_plan',
            error: 'invalid_action_args',
            hint: '参数校验失败：plan.task.done_when: Too small',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: ['plan.task.done_when: Too small'],
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
            action: 'set_plan',
            error: 'invalid_action_args',
            hint: '参数校验失败：plan.trigger: Invalid input',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: ['plan.trigger: Invalid input'],
            },
          },
          {
            action: 'set_plan',
            error: 'invalid_action_args',
            hint: '参数校验失败：plan.task.done_when: Too small',
            code: 'invalid_action_args',
            repair: {
              kind: 'fix_action_args',
              issues: ['plan.task.done_when: Too small'],
            },
          },
        ],
      },
    })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-invalid-plan-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-invalid-plan-1',
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
  expect(result.parsed.text).toContain('当前 set_plan 动作无法继续执行')
  expect(result.parsed.text).toContain('plan.trigger')
  expect(result.parsed.text).toContain('plan.task.done_when')
  expect(result.parsed.text).not.toContain('最终要我产出什么')
})

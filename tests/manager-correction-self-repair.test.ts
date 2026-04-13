import { expect, test } from 'vitest'

import {
  buildCorrectionInput,
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

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
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'bad plan',
        actions: [invalidPlanAction],
        threadId: 'session-manager-invalid-plan',
      }),
    )
    .mockResolvedValueOnce(
      buildRoundResult({
        output: 'bad plan',
        actions: [invalidPlanAction],
        elapsedMs: 4,
        threadId: 'session-manager-invalid-plan',
      }),
    )
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

  const runtime = await createCorrectionRuntime('invalid-plan')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [buildCorrectionInput({ id: 'input-invalid-plan-1' })],
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('当前这轮计划没有形成合法配置')
  expect(result.parsed.text).toContain('何时触发')
  expect(result.parsed.text).toContain('任务边界')
  expect(result.parsed.text).not.toContain('plan.trigger')
})

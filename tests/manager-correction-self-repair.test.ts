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
  expect(result.parsed.text).toContain('当前 set_plan 动作无法继续执行')
  expect(result.parsed.text).toContain('plan.trigger')
  expect(result.parsed.text).toContain('plan.task.done_when')
  expect(result.parsed.text).not.toContain('最终要我产出什么')
})

test('runManagerCorrectionRounds gives manager one repair round when result-only follow-up is missing a concrete action', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce(
      buildRoundResult({
        output: '建议下一步继续推进当前计划，但我先停在这里。',
        actions: [],
        threadId: 'session-manager-missing-followup-action',
        wakeProfile: 'task_result',
      }),
    )
    .mockResolvedValueOnce(
      buildRoundResult({
        output:
          '<M:enqueue_task title="继续推进当前计划" cwd="/tmp/task" goal="继续推进当前整改闭环" in_scope="只推进当前计划已定义范围" done_when_1="本轮后续整改完成" />',
        actions: [
          {
            type: 'enqueue_task',
            task: {
              title: '继续推进当前计划',
              cwd: '/tmp/task',
              mode: 'write',
              goal: '继续推进当前整改闭环',
              in_scope: ['只推进当前计划已定义范围'],
              out_of_scope: [],
              done_when: ['本轮后续整改完成'],
              context_refs: [],
              instructions: [],
            },
          },
        ],
        elapsedMs: 4,
        threadId: 'session-manager-missing-followup-action',
        wakeProfile: 'task_result',
      }),
    )
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [
          {
            action: 'manager_followup',
            error: 'action_execution_rejected',
            hint: '当前是 task_result-only 回合，已有明确续跑锚点，不要只给建议文本；请直接输出具体 action，或输出带结构化 decision 的 handoff / 上提判断。',
            code: 'missing_result_followup_action' as never,
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      done: true,
    })

  const runtime = await createCorrectionRuntime('missing-followup-action')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [],
  })

  expect(runManagerRoundWithRecoveryMock).toHaveBeenCalledTimes(2)
  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.actions).toHaveLength(1)
  expect(result.parsed.actions[0]).toMatchObject({
    type: 'enqueue_task',
  })
})

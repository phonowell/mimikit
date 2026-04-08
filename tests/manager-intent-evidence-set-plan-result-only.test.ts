import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceTask } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

const RESULT_ONLY_FOCUS_ID = 'focus-inbox'
const RESULT_ONLY_TASK_TITLE = '收敛 auth guard 的主链'
const RESULT_ONLY_PLAN_TITLE = '继续推进 auth guard 主线'
const RESULT_ONLY_TASK_GOAL = '收敛 auth guard 的主链并给出下一步落地方向'
const RESULT_ONLY_PLAN_GOAL = '继续推进 auth guard 主线并落地下一步实现'

const createResultOnlyTask = (id: string) =>
  createIntentEvidenceTask({
    id,
    title: RESULT_ONLY_TASK_TITLE,
    cwd: '/repo/auth-guard',
    focusId: RESULT_ONLY_FOCUS_ID,
    status: 'succeeded',
    contract: {
      goal: RESULT_ONLY_TASK_GOAL,
      scope: '只处理 auth guard 主链',
      acceptance: ['给出主链收敛结果'],
    },
    git: {
      worktreePath: '/repo/.worktrees/auth-guard',
      branch: 'task/auth-guard',
      closureRequired: true,
      lifecycle: {
        review: { passed: false },
        merged: false,
        cleaned: false,
      },
    },
  })

const createResultOnlyPlan = (id: string, lastTaskId: string) =>
  createPlanFixture({
    id,
    title: RESULT_ONLY_PLAN_TITLE,
    focusId: RESULT_ONLY_FOCUS_ID,
    status: 'active',
    runtime: {
      runCount: 1,
      lastTaskId,
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: `task-key-${id}`,
      taskContract: {
        goal: RESULT_ONLY_PLAN_GOAL,
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: RESULT_ONLY_PLAN_TITLE,
        executionSpecId: `spec-${id}`,
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: true,
      },
    },
  })

const collectResultOnlySetPlanFeedback = (params: {
  planId: string
  taskId: string
  useWorktree: boolean
}) => {
  const finishedTask = createResultOnlyTask(params.taskId)
  const currentPlan = createResultOnlyPlan(params.planId, finishedTask.id)

  return collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
        continuation_of: {
          type: 'task',
          id: finishedTask.id,
        },
        plan: {
          title: RESULT_ONLY_PLAN_TITLE,
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: RESULT_ONLY_PLAN_TITLE,
            cwd: '/repo/auth-guard',
            mode: 'write',
            use_worktree: params.useWorktree,
            goal: RESULT_ONLY_PLAN_GOAL,
            in_scope: ['继续当前 auth guard 主线'],
            out_of_scope: [],
            done_when: ['下一步主线修改完成'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: 1,
        },
      },
    ],
    {
      inputs: [],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      resultTaskIds: new Set([finishedTask.id]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: RESULT_ONLY_FOCUS_ID,
    },
  )
}

test('set_plan stays allowed when it explicitly continues the single current result task with no fresh user input', () => {
  const feedback = collectResultOnlySetPlanFeedback({
    planId: 'plan-auth-guard-result-only',
    taskId: 'task-finished-auth-guard-set-plan-result-only',
    useWorktree: true,
  })

  expect(feedback).toHaveLength(0)
})

test('set_plan stays blocked when result-only continuation_of changes worktree semantics with no fresh user input', () => {
  const feedback = collectResultOnlySetPlanFeedback({
    planId: 'plan-auth-guard-result-only-mismatch',
    taskId: 'task-finished-auth-guard-set-plan-result-only-mismatch',
    useWorktree: false,
  })

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_plan')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

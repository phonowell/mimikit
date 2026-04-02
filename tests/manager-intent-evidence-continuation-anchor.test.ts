import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceUserInput as createUserInput,
} from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('enqueue_task stays allowed when it explicitly continues the current active plan anchor', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-continue-anchor',
    title: '按整体方案推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    runtime: {
      runCount: 2,
      lastTaskId: 'task-finished-auth-guard-anchor',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-continue-anchor',
      taskContract: {
        goal: '按整体方案推进 auth guard 主线',
        scope: '只处理 auth guard 主线',
        acceptance: ['当前主线继续推进'],
      },
      taskTemplate: {
        title: '按整体方案推进 auth guard 主线',
        executionSpecId: 'spec-continue-anchor',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        continuation_of: {
          type: 'plan',
          id: currentPlan.id,
        },
        task: {
          title: '实现 auth guard 下一步落地修改',
          cwd: '/repo/auth-guard',
          mode: 'write',
          goal: '落地 auth guard 下一步代码修改并验证结果',
          in_scope: ['继续当前 auth guard 主线'],
          out_of_scope: [],
          done_when: ['下一步主线修改完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput('继续推进这一条线。')],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      taskById: new Map(),
      taskStatusById: new Map(),
      resultTaskIds: new Set(['task-finished-auth-guard-anchor']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task stays blocked when continuation_of points to a mismatched result task anchor', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-auth-guard-anchor-mismatch',
    title: '收敛 auth guard 的主链',
    cwd: '/repo/auth-guard',
    focusId: 'focus-inbox',
    status: 'succeeded',
    contract: {
      goal: '收敛 auth guard 的主链并给出下一步落地方向',
      scope: '只处理 auth guard 主链',
      acceptance: ['给出主链收敛结果'],
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        continuation_of: {
          type: 'task',
          id: finishedTask.id,
        },
        task: {
          title: '继续重写支付结算链路',
          cwd: '/repo/payments',
          mode: 'write',
          goal: '重写支付结算链路并补齐回归测试',
          in_scope: ['只处理 payment checkout'],
          out_of_scope: [],
          done_when: ['支付结算主链完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput('继续推进这一条线。')],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      resultTaskIds: new Set([finishedTask.id]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

test('set_plan stays blocked when continuation_of points to a write-plan anchor but changes worktree semantics', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-set-plan-worktree-anchor',
    title: '按整体方案推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    runtime: {
      runCount: 2,
      lastTaskId: 'task-finished-auth-guard-worktree-anchor',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-set-plan-worktree-anchor',
      taskContract: {
        goal: '按整体方案推进 auth guard 主线',
        scope: '只处理 auth guard 主线',
        acceptance: ['当前主线继续推进'],
      },
      taskTemplate: {
        title: '按整体方案推进 auth guard 主线',
        executionSpecId: 'spec-set-plan-worktree-anchor',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: true,
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
        continuation_of: {
          type: 'plan',
          id: currentPlan.id,
        },
        plan: {
          title: '继续推进 auth guard 主线',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: '继续推进 auth guard 主线',
            cwd: '/repo/auth-guard',
            mode: 'write',
            use_worktree: false,
            goal: '继续推进 auth guard 主线并落地下一步实现',
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
      inputs: [createUserInput('继续推进这一条线。')],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      taskById: new Map(),
      taskStatusById: new Map(),
      resultTaskIds: new Set(['task-finished-auth-guard-worktree-anchor']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_plan')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

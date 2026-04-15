import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'

test('set_plan(write) update stays blocked when direct plan reference rewrites the execution lane without fresh lane evidence', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-auth-guard-lane-shift',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-lane-shift',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-lane-shift',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
        plan: {
          title: '把剩余鉴权落地改成更大步推进',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: '按专题批量收敛登录门禁后续落地',
            cwd: '/repo/billing',
            mode: 'write',
            use_worktree: true,
            goal: '按更大步方式把后续登录门禁落地点一次性推完',
            in_scope: ['只处理当前鉴权主线'],
            out_of_scope: [],
            done_when: ['本轮专题落地完成'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: null,
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          `把 ${currentPlan.id} 这个计划改掉，别再细抠了，直接大步推进。`,
        ),
      ],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_plan')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

test('set_plan(write) update stays allowed when the user explicitly authorizes the new execution lane', () => {
  const currentPlan = createPlanFixture({
    id: 'plan-auth-guard-lane-shift-authorized',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    status: 'active',
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-auth-guard-lane-shift-authorized',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-lane-shift-authorized',
        cwd: '/repo/auth-guard',
        resourceMode: 'write',
        useWorktree: false,
      },
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
        plan: {
          title: '把剩余鉴权落地改成更大步推进',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: '按专题批量收敛登录门禁后续落地',
            cwd: '/repo/billing',
            mode: 'write',
            use_worktree: true,
            goal: '按更大步方式把后续登录门禁落地点一次性推完',
            in_scope: ['只处理当前鉴权主线'],
            out_of_scope: [],
            done_when: ['本轮专题落地完成'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: null,
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          `把 ${currentPlan.id} 这个计划改掉；cwd=/repo/billing；mode=write；use_worktree=true。`,
        ),
      ],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

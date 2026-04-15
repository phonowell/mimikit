import { test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { expectSingleRejectedFeedback } from './helpers/manager-intent-evidence.js'

test('enqueue_task(write) stays blocked when only a semantically similar same-lane active plan exists without runtime ownership', () => {
  const unownedPlan = {
    id: 'plan-followup-unowned-similar',
    title: '按整体方案推进 auth guard 主线',
    focusId: 'focus-inbox',
    priority: 'normal' as const,
    status: 'active' as const,
    trigger: {
      mode: 'on_worker_slot_freed' as const,
    },
    effect: {
      kind: 'enqueue_task' as const,
      taskKey: 'task-key-followup-unowned-similar',
      taskContract: {
        goal: '沿当前鉴权链路补齐入口门禁剩余改造',
        scope: '只处理 auth guard 主线',
        acceptance: ['入口门禁剩余改造完成'],
      },
      taskTemplate: {
        title: '推进 auth guard 主线收尾',
        executionSpecId: 'spec-followup-unowned-similar',
        cwd: '/repo/auth-guard',
        resourceMode: 'write' as const,
        useWorktree: false,
      },
    },
    createdAt: '2026-04-02T00:04:00.000Z',
    updatedAt: '2026-04-02T00:04:00.000Z',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-other-line',
    },
  }

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '补齐入口门禁剩余改造',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '沿当前鉴权链路继续补实现并完成验收',
          in_scope: ['聚焦登录门禁后续落地'],
          out_of_scope: [],
          done_when: ['当前入口门禁主线收尾完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [],
      planById: new Map([[unownedPlan.id, unownedPlan]]),
      planStatusById: new Map([[unownedPlan.id, unownedPlan.status]]),
      resultTaskIds: new Set(['task-finished-followup-low-risk-continue']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'enqueue_task',
    error: 'action_execution_rejected',
    hintIncludes: ['授权'],
  })
})

test('enqueue_task(write) asks for lightweight confirmation when task_result follow-up still matches competing worklines', () => {
  const firstPlan = {
    id: 'plan-followup-ambiguous-a',
    title: '继续推进 auth guard 后续整改',
    focusId: 'focus-inbox',
    priority: 'normal' as const,
    status: 'active' as const,
    trigger: {
      mode: 'on_worker_slot_freed' as const,
    },
    effect: {
      kind: 'enqueue_task' as const,
      taskKey: 'task-key-followup-ambiguous-a',
      taskContract: {
        goal: '沿当前鉴权链路继续推进 auth guard 后续整改',
        scope: '只处理 auth guard 主线',
        acceptance: ['后续整改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 后续整改',
        executionSpecId: 'spec-followup-ambiguous-a',
        cwd: '/repo/auth-guard',
        resourceMode: 'write' as const,
        useWorktree: false,
      },
    },
    createdAt: '2026-04-02T00:04:00.000Z',
    updatedAt: '2026-04-02T00:04:00.000Z',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-followup-ambiguous',
    },
  }
  const secondPlan = {
    id: 'plan-followup-ambiguous-b',
    title: '继续推进 auth guard 剩余整改',
    focusId: 'focus-inbox',
    priority: 'normal' as const,
    status: 'active' as const,
    trigger: {
      mode: 'on_worker_slot_freed' as const,
    },
    effect: {
      kind: 'enqueue_task' as const,
      taskKey: 'task-key-followup-ambiguous-b',
      taskContract: {
        goal: '沿当前鉴权链路继续推进 auth guard 剩余整改',
        scope: '只处理 auth guard 主线',
        acceptance: ['剩余整改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 剩余整改',
        executionSpecId: 'spec-followup-ambiguous-b',
        cwd: '/repo/auth-guard',
        resourceMode: 'write' as const,
        useWorktree: false,
      },
    },
    createdAt: '2026-04-02T00:04:00.000Z',
    updatedAt: '2026-04-02T00:04:00.000Z',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-followup-ambiguous',
    },
  }

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '继续推进 auth guard 当前整改',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '沿当前鉴权链路继续推进这一批整改',
          in_scope: ['只处理 auth guard 主线'],
          out_of_scope: [],
          done_when: ['这一批整改完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [],
      planById: new Map([
        [firstPlan.id, firstPlan],
        [secondPlan.id, secondPlan],
      ]),
      planStatusById: new Map([
        [firstPlan.id, firstPlan.status],
        [secondPlan.id, secondPlan.status],
      ]),
      resultTaskIds: new Set(['task-finished-followup-ambiguous']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'enqueue_task',
    error: 'action_execution_rejected',
    hintIncludes: [
      '哪一条工作线',
      'plan-followup-ambiguous-a',
      'plan-followup-ambiguous-b',
    ],
  })
})

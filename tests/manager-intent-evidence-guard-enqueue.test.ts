import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'

test('enqueue_task is blocked when only supplemental evidence suggests new work', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: 'Implement intent evidence guard',
          cwd: '/repo/mimikit',
          mode: 'write',
          goal: 'Add an intent-evidence guard for manager high-risk actions',
          in_scope: ['Validation and feedback flow only'],
          out_of_scope: [],
          done_when: ['Guard blocks unsupported risky actions'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput('先总结当前状态，不要开始新任务。')],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
  expect(feedback[0]?.hint).toContain('授权')
  expect(feedback[0]?.hint).toContain('task_result')
})

test('enqueue_task stays allowed when current user input directly supports it', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: 'Implement intent evidence guard',
          cwd: '/repo/mimikit',
          mode: 'write',
          goal: 'Implement intent evidence guard for manager high-risk actions',
          in_scope: ['Touch validation and feedback flow only'],
          out_of_scope: [],
          done_when: ['Guard blocks unsupported risky actions'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          '请实现 intent evidence guard，只改 manager validation and feedback flow，并确保能拦住 unsupported risky actions。',
        ),
      ],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

test('read-mode enqueue_task stays allowed when only supplemental evidence suggests low-risk continuation', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '继续核对 action 收缩方案',
          cwd: '/repo/mimikit',
          mode: 'read',
          goal: '继续核对 action 收缩方案并给出结论',
          in_scope: ['只读核对 manager action 设计'],
          out_of_scope: [],
          done_when: ['返回核对结论'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task(write) stays allowed on task_result follow-up when one active workline is the clear low-risk continuation target', () => {
  const anchoredPlan = {
    id: 'plan-followup-low-risk-continue',
    title: '按整体方案推进 auth guard 主线',
    focusId: 'focus-inbox',
    priority: 'normal' as const,
    status: 'active' as const,
    trigger: {
      mode: 'on_worker_slot_freed' as const,
    },
    effect: {
      kind: 'enqueue_task' as const,
      taskKey: 'task-key-followup-low-risk-continue',
      taskContract: {
        goal: '沿当前鉴权链路补齐入口门禁剩余改造',
        scope: '只处理 auth guard 主线',
        acceptance: ['入口门禁剩余改造完成'],
      },
      taskTemplate: {
        title: '推进 auth guard 主线收尾',
        executionSpecId: 'spec-followup-low-risk-continue',
        cwd: '/repo/auth-guard',
        resourceMode: 'write' as const,
        useWorktree: false,
      },
    },
    createdAt: '2026-04-02T00:04:00.000Z',
    updatedAt: '2026-04-02T00:04:00.000Z',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-finished-followup-low-risk-continue',
    },
  }
  const otherPlan = {
    id: 'plan-followup-low-risk-other',
    title: '推进 billing retry 主线',
    focusId: 'focus-inbox',
    priority: 'normal' as const,
    status: 'active' as const,
    trigger: {
      mode: 'on_worker_slot_freed' as const,
    },
    effect: {
      kind: 'enqueue_task' as const,
      taskKey: 'task-key-followup-low-risk-other',
      taskContract: {
        goal: '收敛 billing retry 主线并完成回归',
        scope: '只处理 billing retry pipeline',
        acceptance: ['billing retry 回归完成'],
      },
      taskTemplate: {
        title: '推进 billing retry 主线',
        executionSpecId: 'spec-followup-low-risk-other',
        cwd: '/repo/auth-guard',
        resourceMode: 'write' as const,
        useWorktree: false,
      },
    },
    createdAt: '2026-04-02T00:04:00.000Z',
    updatedAt: '2026-04-02T00:04:00.000Z',
    runtime: {
      runCount: 1,
      lastTaskId: 'task-other',
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
      planById: new Map([
        [anchoredPlan.id, anchoredPlan],
        [otherPlan.id, otherPlan],
      ]),
      planStatusById: new Map([
        [anchoredPlan.id, anchoredPlan.status],
        [otherPlan.id, otherPlan.status],
      ]),
      resultTaskIds: new Set(['task-finished-followup-low-risk-continue']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

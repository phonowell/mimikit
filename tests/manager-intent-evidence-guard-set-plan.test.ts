import { test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('set_plan(write) does not treat a longer cwd as exact lane evidence', () => {
  const currentPlan = {
    id: 'plan-auth-guard-cwd-anchor',
    title: '继续推进 auth guard 主线',
    focusId: 'focus-inbox',
    priority: 'normal' as const,
    status: 'active' as const,
    trigger: {
      mode: 'on_worker_slot_freed' as const,
    },
    effect: {
      kind: 'enqueue_task' as const,
      taskKey: 'task-key-auth-guard-cwd-anchor',
      taskContract: {
        goal: '继续推进 auth guard 主线并落地下一步实现',
        scope: '只处理 auth guard 主线',
        acceptance: ['下一步主线修改完成'],
      },
      taskTemplate: {
        title: '继续推进 auth guard 主线',
        executionSpecId: 'spec-auth-guard-cwd-anchor',
        cwd: '/repo/auth-guard-legacy',
        resourceMode: 'write' as const,
        useWorktree: false,
      },
    },
    createdAt: '2026-04-02T00:04:00.000Z',
    updatedAt: '2026-04-02T00:04:00.000Z',
    runtime: {
      runCount: 1,
    },
  }

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
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
            in_scope: ['只处理 auth guard 主线'],
            out_of_scope: [],
            done_when: ['下一步主线修改完成'],
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
          `把 ${currentPlan.id} 改到 /repo/auth-guard-legacy 这条目录继续做。`,
        ),
      ],
      planById: new Map([[currentPlan.id, currentPlan]]),
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'set_plan',
    error: 'action_execution_rejected',
    hintIncludes: ['授权'],
  })
})

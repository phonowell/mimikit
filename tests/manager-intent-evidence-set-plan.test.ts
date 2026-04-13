import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'

import type { TaskPlan } from '../src/foundation/types/index.js'

test('set_plan update stays allowed when user references the current plan and the changed direction', () => {
  const currentPlan: TaskPlan = {
    id: 'plan-24168262862e4d6e8fd8a2f7fab2d901',
    title: '按整体方案细粒度推进后续整改',
    focusId: 'focus-inbox',
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'cron',
      cron: '0 */30 * * * *',
      timeZone: 'Asia/Shanghai',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-fine-grained',
      taskContract: {
        goal: '按细粒度方式逐项推进整体方案中的剩余整改',
        scope: '每轮只推进单个最小整改',
        acceptance: ['单项最小闭环完成'],
      },
      taskTemplate: {
        title: '按整体方案细粒度推进下一项整改',
        executionSpecId: 'spec-fine-grained',
        cwd: '/repo/mimikit',
        resourceMode: 'write',
      },
    },
    createdAt: '2026-03-29T03:00:00.000Z',
    updatedAt: '2026-03-29T03:00:00.000Z',
    runtime: {
      runCount: 0,
    },
  }

  const context = {
    inputs: [
      createUserInput(
        '然后现在的 plan-24168262862e4d6e8fd8a2f7fab2d901 推进的粒度太细了，我很不满意；你要粗粒度推进',
      ),
    ],
    planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
    planById: new Map([[currentPlan.id, currentPlan]]),
    supplementalEvidenceSources: new Set(['task_result'] as const),
  }

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
        plan: {
          title: '按整体方案粗粒度推进后续整改直至落地完成',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: '按整体方案粗粒度推进下一批未完成整改',
            cwd: '/repo/mimikit',
            mode: 'write',
            goal: '以粗粒度方式推进下一批未完成整改',
            in_scope: ['优先按阶段或专题推进更大闭环'],
            out_of_scope: [],
            done_when: ['本轮粗粒度专题已完成'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: null,
        },
      },
    ],
    context,
  )

  expect(feedback).toHaveLength(0)
})

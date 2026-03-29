import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'

import type { TaskPlan } from '../src/foundation/types/index.js'

test('set_plan update stays allowed when user references the current plan and changes scope or acceptance semantics', () => {
  const currentPlan: TaskPlan = {
    id: 'plan-keep-runtime-visible',
    title: '按整体方案推进后续整改',
    focusId: 'focus-inbox',
    priority: 'normal',
    status: 'active',
    trigger: {
      mode: 'on_worker_slot_freed',
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: 'task-key-plan-progress',
      taskContract: {
        goal: '持续推进整体方案中的剩余整改',
        scope: '每轮只推进单个最小整改',
        acceptance: ['单项最小闭环完成'],
      },
      taskTemplate: {
        title: '按整体方案推进下一项整改',
        executionSpecId: 'spec-plan-progress',
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

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: currentPlan.id,
        plan: {
          title: currentPlan.title,
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: '按整体方案推进下一批整改',
            cwd: '/repo/mimikit',
            mode: 'write',
            goal: '持续推进整体方案中的剩余整改',
            in_scope: ['按专题推进更大的可见闭环，不再拆成单个碎片任务'],
            out_of_scope: [],
            done_when: ['当前专题的可见闭环已经完成并汇总缺口'],
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
          'plan-keep-runtime-visible 这个计划别再按单个碎片任务推进了，改成按专题做完一批再给我汇总缺口。',
        ),
      ],
      planStatusById: new Map([[currentPlan.id, currentPlan.status]]),
      planById: new Map([[currentPlan.id, currentPlan]]),
      supplementalEvidenceSources: new Set(['task_result'] as const),
    },
  )

  expect(feedback).toHaveLength(0)
})

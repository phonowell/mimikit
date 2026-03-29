import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTaskContext,
  createIntentEvidenceTask as createTask,
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

import type { TaskPlan } from '../src/foundation/types/index.js'

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
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
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

test('task_control is blocked when user input does not identify the task', () => {
  const task = createTask()
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: [],
      },
    ],
    createIntentEvidenceTaskContext(task, [
      createUserInput('先看看文档里怎么说。'),
    ]),
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'task_control',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过', task.id],
  })
})

test('task_control stays allowed when user explicitly references the task', () => {
  const task = createTask()
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: [],
      },
    ],
    {
      inputs: [createUserInput(`请取消 ${task.id}，也就是 ${task.title}。`)],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

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

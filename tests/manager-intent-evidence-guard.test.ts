import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTaskContext,
  createIntentEvidenceTask as createTask,
  createIntentEvidenceUserInput as createUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

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

test('task_control stays blocked when user input only mentions weak runtime signals like branch or cwd basename', () => {
  const task = createTask({
    id: 'task-login-interceptor',
    title: 'Refactor login interceptor',
    cwd: '/repo/auth-guard',
    branch: 'task/auth-guard',
  })
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
      inputs: [
        createUserInput(
          '请取消 task/auth-guard 这个分支里的那项 auth-guard 任务。',
        ),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'task_control',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过', task.id],
  })
})

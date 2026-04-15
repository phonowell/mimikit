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
    hintIncludes: ['哪一条工作线', 'plan-followup-ambiguous-a', 'plan-followup-ambiguous-b'],
  })
})

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
    hintIncludes: ['授权', task.id],
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
    hintIncludes: ['授权', task.id],
  })
})

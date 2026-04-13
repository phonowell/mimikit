import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceUserInput as createUserInput,
} from './helpers/manager-intent-evidence.js'

test('enqueue_task stays blocked when a paused task already matches the same continuation but current user input only gives generic continuation text', () => {
  const pausedTask = createIntentEvidenceTask({
    id: 'task-paused-auth-guard',
    title: '继续收敛 auth guard 主链',
    cwd: '/repo/auth-guard',
    status: 'paused',
    resourceMode: 'write',
    contract: {
      goal: '继续收敛 auth guard 的下一步主链并落地代码修改',
      scope: '延续 auth guard 主链',
      acceptance: ['下一步主链落地完成'],
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '继续收敛 auth guard 的下一步主链',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '继续收敛 auth guard 的下一步主链并落地代码修改',
          in_scope: ['延续 auth guard 主链'],
          out_of_scope: [],
          done_when: ['下一步主链落地完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput('继续把这一条线做完。')],
      taskById: new Map([[pausedTask.id, pausedTask]]),
      taskStatusById: new Map([[pausedTask.id, pausedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

test('enqueue_task stays allowed when the only paused task shares the same lane but current user input directly authorizes a different write task', () => {
  const pausedTask = createIntentEvidenceTask({
    id: 'task-paused-auth-guard-unrelated',
    title: '继续收敛 auth guard 主链',
    cwd: '/repo/auth-guard',
    status: 'paused',
    resourceMode: 'write',
    contract: {
      goal: '继续收敛 auth guard 的下一步主链并落地代码修改',
      scope: '延续 auth guard 主链',
      acceptance: ['下一步主链落地完成'],
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '新建 release pipeline 验证任务',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: false,
          goal: '实现 release pipeline 的首轮验证脚本并补齐最小验收',
          in_scope: ['只处理 release pipeline 首轮验证'],
          out_of_scope: [],
          done_when: ['首轮验证脚本可运行'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          '新开一个 write 任务做 release pipeline 首轮验证，只处理 release pipeline 首轮验证，并让首轮验证脚本可运行。',
        ),
      ],
      taskById: new Map([[pausedTask.id, pausedTask]]),
      taskStatusById: new Map([[pausedTask.id, pausedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task stays blocked when the only paused continuation match is already git-closed but current user input only gives generic continuation text', () => {
  const pausedTask = createIntentEvidenceTask({
    id: 'task-paused-auth-guard-closed',
    title: '继续收敛 auth guard 主链',
    cwd: '/repo/auth-guard',
    status: 'paused',
    resourceMode: 'write',
    git: {
      worktreePath: '/repo/auth-guard/.worktrees/task-paused-auth-guard-closed',
      branch: 'task/auth-guard-closed',
      closureRequired: true,
      lifecycle: {
        review: {
          passed: true,
          at: '2026-04-08T01:00:00.000Z',
          sha: 'abc123',
        },
        merged: true,
        cleaned: true,
      },
    },
    contract: {
      goal: '继续收敛 auth guard 的下一步主链并落地代码修改',
      scope: '延续 auth guard 主链',
      acceptance: ['下一步主链落地完成'],
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '继续收敛 auth guard 的下一步主链',
          cwd: '/repo/auth-guard',
          mode: 'write',
          use_worktree: true,
          goal: '继续收敛 auth guard 的下一步主链并落地代码修改',
          in_scope: ['延续 auth guard 主链'],
          out_of_scope: [],
          done_when: ['下一步主链落地完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput('继续把这一条线做完。')],
      taskById: new Map([[pausedTask.id, pausedTask]]),
      taskStatusById: new Map([[pausedTask.id, pausedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.code).toBe('intent_evidence_missing')
})

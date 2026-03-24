import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import type { Task, UserInput } from '../src/foundation/types/index.js'

const createUserInput = (text: string): UserInput => ({
  id: 'input-user',
  role: 'user',
  text,
  createdAt: '2026-03-20T08:00:00.000Z',
  focusId: 'focus-inbox',
})

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-refactor-auth',
  fingerprint: 'task-refactor-auth-fingerprint',
  prompt: 'Refactor auth guard',
  title: 'Refactor auth guard',
  cwd: '/repo/auth-guard',
  focusId: 'focus-inbox',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-20T08:00:00.000Z',
  ...overrides,
})

test('mutate_task git closure stays blocked when user only references task without explicit closure action', () => {
  const task = createTask({
    status: 'succeeded',
    git: {
      worktreePath: '/repo/auth-guard',
      branch: 'feature/auth-guard',
      lifecycle: {
        review: {
          passed: true,
        },
        merged: false,
        cleaned: false,
      },
    },
  })
  const feedback = collectManagerActionFeedback(
    [{ name: 'mutate_task', attrs: { id: task.id, op: 'merged', reason: 'mark this task as merged to main' } }],
    {
      inputs: [createUserInput(`请看一下 ${task.id}，也就是 ${task.title}。`)],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('mutate_task')
  expect(feedback[0]?.hint).toContain('当前需要：merged')
})

test('mutate_task git closure stays allowed when user explicitly requests the closure action', () => {
  const task = createTask({
    status: 'succeeded',
    git: {
      worktreePath: '/repo/auth-guard',
      branch: 'feature/auth-guard',
      lifecycle: {
        review: {
          passed: true,
        },
        merged: false,
        cleaned: false,
      },
    },
  })
  const feedback = collectManagerActionFeedback(
    [{ name: 'mutate_task', attrs: { id: task.id, op: 'merged', reason: '把这个任务标记为已合并到 main' } }],
    {
      inputs: [
        createUserInput(
          `请把 ${task.id} 标记为已合并到 main，也就是 ${task.title} 这条任务。`,
        ),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

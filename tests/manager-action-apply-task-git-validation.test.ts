import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'
import { validateMutateTask } from '../src/policy/manager/action-validation-risk.js'

const TASK_CWD = '/tmp/manager-action-apply-task-git'

test('validateMutateTask rejects merged without review_passed', () => {
  const task = {
    id: 'task-git-no-review',
    fingerprint: 'task-git-no-review',
    prompt: 'merge task',
    title: 'Merge Task',
    cwd: TASK_CWD,
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker' as const,
    provider: 'codex' as const,
    status: 'succeeded' as const,
    createdAt: '2026-03-23T00:00:00.000Z',
    completedAt: '2026-03-23T00:10:00.000Z',
    git: {
      worktreePath: TASK_CWD,
      branch: 'feature/task-git-no-review',
    },
  }

  const issues = validateMutateTask(
    {
      name: 'mutate_task',
      attrs: {
        id: task.id,
        op: 'merged',
        reason: '把这个任务标记为已合并到 main',
      },
    },
    {
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
    },
  )

  expect(issues[0]?.hint).toContain('尚未记录 review passed')
})

test('validateMutateTask rejects review_passed on non-git task', () => {
  const task = {
    id: 'task-no-git',
    fingerprint: 'task-no-git',
    prompt: 'review task',
    title: 'Review Task',
    cwd: TASK_CWD,
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker' as const,
    provider: 'codex' as const,
    status: 'succeeded' as const,
    createdAt: '2026-03-23T00:00:00.000Z',
    completedAt: '2026-03-23T00:10:00.000Z',
  }

  const issues = validateMutateTask(
    {
      name: 'mutate_task',
      attrs: {
        id: task.id,
        op: 'review_passed',
        reason: '把这条任务标记为 review 已通过',
      },
    },
    {
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
    },
  )

  expect(issues[0]?.hint).toContain('没有 git 执行上下文')
})

test('validateMutateTask rejects git lifecycle op without explicit reason', () => {
  const task = {
    id: 'task-git-no-reason',
    fingerprint: 'task-git-no-reason',
    prompt: 'review task',
    title: 'Review Task',
    cwd: TASK_CWD,
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker' as const,
    provider: 'codex' as const,
    status: 'succeeded' as const,
    createdAt: '2026-03-23T00:00:00.000Z',
    completedAt: '2026-03-23T00:10:00.000Z',
    git: {
      worktreePath: TASK_CWD,
      branch: 'feature/task-git-no-reason',
    },
  }

  const issues = validateMutateTask(
    {
      name: 'mutate_task',
      attrs: {
        id: task.id,
        op: 'review_passed',
      },
    },
    {
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
    },
  )

  expect(issues[0]?.hint).toContain('必须附带 `reason`')
})

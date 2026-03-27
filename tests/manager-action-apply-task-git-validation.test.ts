import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'
import { validateRecordTaskGit } from '../src/policy/manager/action-validation.js'

const TASK_CWD = '/tmp/manager-action-apply-task-git'

test('validateRecordTaskGit rejects merged without review_passed', () => {
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

  const issues = validateRecordTaskGit(
    {
      type: 'record_task_git',
      task_id: task.id,
      state: 'merged',
    },
    {
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
    },
  )

  expect(issues[0]?.hint).toContain('尚未记录 review passed')
})

test('validateRecordTaskGit rejects review_passed on non-git task', () => {
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

  const issues = validateRecordTaskGit(
    {
      type: 'record_task_git',
      task_id: task.id,
      state: 'review_passed',
    },
    {
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
    },
  )

  expect(issues[0]?.hint).toContain('没有 git 执行上下文')
})

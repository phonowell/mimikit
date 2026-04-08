import { expect, test } from 'vitest'

import { hasTaskClosedGitLifecycle } from '../src/work/shared/task-git-closure-truth.js'
import { reconcileTaskGitState } from '../src/work/shared/task-git-lifecycle.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'

test('reconcileTaskGitState preserves review evidence while ignoring unverified handoff merged or cleaned truth', () => {
  const task = createTaskFixture({
    id: 'task-git-handoff-richer',
    repoKey: '/tmp/task-git-handoff-richer/.git',
    branch: 'feature/task-git-handoff-richer',
    git: {
      worktreePath: '/tmp/task-git-handoff-richer',
      branch: 'feature/task-git-handoff-richer',
      closureRequired: true,
      lifecycle: {
        review: { passed: false },
        merged: false,
        cleaned: false,
      },
    },
    result: {
      taskId: 'task-git-handoff-richer',
      status: 'succeeded',
      ok: true,
      output: 'done',
      durationMs: 1,
      completedAt: '2026-02-06T00:02:00.000Z',
      handoff: {
        summary: 'done',
        git: {
          worktreePath: '/tmp/task-git-handoff-richer',
          branch: 'feature/task-git-handoff-richer',
          closureRequired: true,
          lifecycle: {
            review: {
              passed: true,
              at: '2026-02-06T00:01:00.000Z',
              sha: 'abc123',
            },
            merged: true,
            mergedAt: '2026-02-06T00:01:30.000Z',
            cleaned: false,
          },
        },
      },
    },
  })

  const reconciled = reconcileTaskGitState(task)

  expect(reconciled.git?.lifecycle).toMatchObject({
    review: {
      passed: true,
      at: '2026-02-06T00:01:00.000Z',
      sha: 'abc123',
    },
    merged: false,
    cleaned: true,
  })
  expect(reconciled.result?.handoff?.git?.lifecycle).toMatchObject({
    review: {
      passed: true,
      at: '2026-02-06T00:01:00.000Z',
      sha: 'abc123',
    },
    merged: false,
    cleaned: true,
  })
  expect(reconciled.git?.lifecycle).not.toHaveProperty('mergedAt')
  expect(reconciled.result?.handoff?.git?.lifecycle).not.toHaveProperty(
    'mergedAt',
  )
  expect(hasTaskClosedGitLifecycle(reconciled)).toBe(false)
})

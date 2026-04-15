import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  applyClosureTaskGitTruth,
  hasTaskClosedGitLifecycle,
} from '../src/work/shared/task-git-closure-truth.js'

import { createMergedClosureRepo as createRealMergedClosureRepo } from './helpers/git-closure-truth.js'
import {
  createClosureTaskFixture,
  createSourceTaskFixture,
  expectPromotedReviewOnlyTruth,
} from './task-git-closure-truth-fixtures.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-closure-truth-'))

test('applyClosureTaskGitTruth preserves source task git identity while promoting only review truth when merge cannot be reverified', async () => {
  const repoRoot = await createTmpDir()
  const worktreePath = join(repoRoot, 'missing-source-worktree')
  const sourceTask = createSourceTaskFixture({
    id: 'task-source-identity-preserved',
    repoKey: join(repoRoot, '.git'),
    branch: 'task/source-identity-preserved',
    worktreePath,
  })
  const closureTask = createClosureTaskFixture({
    id: 'task-closure-identity-preserved',
    sourceTaskId: sourceTask.id,
  })

  applyClosureTaskGitTruth([sourceTask, closureTask], closureTask)

  expectPromotedReviewOnlyTruth(sourceTask, {
    worktreePath,
    branch: 'task/source-identity-preserved',
    cleaned: true,
    merged: false,
  })
})

test(
  'applyClosureTaskGitTruth re-derives merged truth from source review sha after real merge and cleanup',
  { timeout: 30000 },
  async () => {
    const { repoRoot, worktreePath, branch, reviewSha } =
      await createRealMergedClosureRepo()
    const sourceTask = createSourceTaskFixture({
      id: 'task-source-merged-after-cleanup',
      repoKey: join(repoRoot, '.git'),
      branch,
      worktreePath,
    })
    const closureTask = createClosureTaskFixture({
      id: 'task-closure-merged-after-cleanup',
      sourceTaskId: sourceTask.id,
    })
    if (closureTask.result?.handoff?.git?.lifecycle?.review) {
      closureTask.result.handoff.git.lifecycle.review = {
        passed: true,
        at: '2026-04-01T03:21:30.000Z',
        sha: reviewSha,
      }
    }

    applyClosureTaskGitTruth([sourceTask, closureTask], closureTask)

    expectPromotedReviewOnlyTruth(sourceTask, {
      worktreePath,
      branch,
      reviewAt: '2026-04-01T03:21:30.000Z',
      reviewSha,
      merged: true,
      cleaned: true,
    })
    expect(hasTaskClosedGitLifecycle(sourceTask)).toBe(true)
  },
)

test('applyClosureTaskGitTruth does not trust closure-reported merged or cleaned when source git identity cannot verify them', async () => {
  const repoRoot = await createTmpDir()
  const worktreePath = join(repoRoot, 'source-worktree')
  await mkdir(worktreePath, { recursive: true })

  const sourceTask = createSourceTaskFixture({
    id: 'task-source-runtime-verification',
    repoKey: join(repoRoot, '.git'),
    branch: 'task/source-runtime-verification',
    worktreePath,
  })
  const closureTask = createClosureTaskFixture({
    id: 'task-closure-runtime-verification',
    sourceTaskId: sourceTask.id,
  })

  applyClosureTaskGitTruth([sourceTask, closureTask], closureTask)

  expectPromotedReviewOnlyTruth(sourceTask, {
    worktreePath,
    branch: 'task/source-runtime-verification',
    merged: false,
    cleaned: false,
  })
})

test('applyClosureTaskGitTruth preserves verified source cleanedAt instead of overwriting it with closure-reported timestamps', async () => {
  const repoRoot = await createTmpDir()
  const worktreePath = join(repoRoot, 'missing-cleaned-worktree')
  const sourceTask = createSourceTaskFixture({
    id: 'task-source-cleaned-at-preserved',
    repoKey: join(repoRoot, '.git'),
    branch: 'task/source-cleaned-at-preserved',
    worktreePath,
  })
  const cleanedAt = '2026-02-06T00:03:00.000Z'
  if (sourceTask.git?.lifecycle) {
    sourceTask.git.lifecycle = {
      ...sourceTask.git.lifecycle,
      cleaned: true,
      cleanedAt,
    }
  }
  if (sourceTask.result?.handoff?.git?.lifecycle) {
    sourceTask.result.handoff.git.lifecycle = {
      ...sourceTask.result.handoff.git.lifecycle,
      cleaned: true,
      cleanedAt,
    }
  }
  const closureTask = createClosureTaskFixture({
    id: 'task-closure-cleaned-at-preserved',
    sourceTaskId: sourceTask.id,
  })

  applyClosureTaskGitTruth([sourceTask, closureTask], closureTask)

  expectPromotedReviewOnlyTruth(sourceTask, {
    worktreePath,
    branch: 'task/source-cleaned-at-preserved',
    merged: false,
    cleaned: true,
    cleanedAt,
  })
})

test('applyClosureTaskGitTruth does not inject closure git identity into a source task that has no git identity', () => {
  const sourceTask = createSourceTaskFixture({
    id: 'task-source-without-git-identity',
    repoKey: '/tmp/source-without-git-identity/.git',
    branch: 'task/source-without-git-identity',
    worktreePath: '/tmp/source-without-git-identity',
  })
  delete sourceTask.git
  if (sourceTask.result?.handoff) delete sourceTask.result.handoff.git

  const closureTask = createClosureTaskFixture({
    id: 'task-closure-without-source-git-identity',
    sourceTaskId: sourceTask.id,
  })

  const updatedTaskIds = applyClosureTaskGitTruth(
    [sourceTask, closureTask],
    closureTask,
  )

  expect(updatedTaskIds).toEqual([])
  expect(sourceTask.git).toBeUndefined()
  expect(sourceTask.result?.handoff?.git).toBeUndefined()
})

test('hasTaskClosedGitLifecycle ignores closure-reported merged or cleaned booleans without runtime-verifiable source identity truth', () => {
  const task = createSourceTaskFixture({
    id: 'task-closed-truth-must-be-runtime-verifiable',
    repoKey: '/tmp/task-closed-truth-must-be-runtime-verifiable/.git',
    branch: 'task/closed-truth-must-be-runtime-verifiable',
    worktreePath: '/tmp/task-closed-truth-must-be-runtime-verifiable',
  })
  delete task.git
  if (task.result?.handoff?.git?.lifecycle) {
    task.result.handoff.git.lifecycle = {
      ...task.result.handoff.git.lifecycle,
      review: {
        passed: true,
        at: '2026-02-06T00:04:00.000Z',
        sha: 'abc123',
      },
      merged: true,
      cleaned: true,
    }
  }

  expect(hasTaskClosedGitLifecycle(task)).toBe(false)
})

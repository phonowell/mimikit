import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { buildTaskViews } from '../src/surface/read-model/task-view.js'
import { cleanupGitRepos, createGitRepo } from './helpers/git-repo.js'
import { createTaskFixture } from './helpers/runtime-snapshot.js'

afterEach(cleanupGitRepos)

test('buildTaskViews derives review passed from worktree sentinel', async () => {
  const cwd = await createGitRepo()
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim()
  await mkdir(join(cwd, '.mimikit'), { recursive: true })
  await writeFile(
    join(cwd, '.mimikit', 'review-code-changes.passed'),
    `at=2026-03-21T00:00:00.000Z\nsha=${sha}\n`,
    'utf8',
  )

  const task = createTaskFixture({
    id: 'task-review',
    repoKey: join(cwd, '.git'),
    git: { worktreePath: cwd, branch: 'main' },
  })
  const { tasks: views } = buildTaskViews([task])
  expect(views[0]?.gitClosure?.review).toMatchObject({
    passed: true,
    at: '2026-03-21T00:00:00.000Z',
    sha,
  })
})

test('buildTaskViews derives merged=true when sentinel sha is ancestor of main', async () => {
  const cwd = await createGitRepo()
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim()
  await mkdir(join(cwd, '.mimikit'), { recursive: true })
  await writeFile(
    join(cwd, '.mimikit', 'review-code-changes.passed'),
    `sha=${sha}\n`,
    'utf8',
  )

  const task = createTaskFixture({
    id: 'task-merged',
    repoKey: join(cwd, '.git'),
    git: { worktreePath: cwd, branch: 'main' },
  })
  const { tasks: views } = buildTaskViews([task])
  expect(views[0]?.gitClosure?.merged).toBe(true)
})

test('buildTaskViews derives cleaned=true when worktreePath is missing', () => {
  const task = createTaskFixture({
    id: 'task-cleaned',
    git: { worktreePath: '/tmp/mimikit-missing-worktree', branch: 'main' },
  })
  const { tasks: views } = buildTaskViews([task])
  expect(views[0]?.gitClosure?.cleaned).toBe(true)
})

test('buildTaskViews keeps explicit lifecycle fields while merging derived closure', () => {
  const task = createTaskFixture({
    id: 'task-explicit-git-closure',
    git: {
      worktreePath: '/tmp/mimikit-missing-worktree',
      branch: 'main',
      lifecycle: {
        review: {
          passed: true,
          at: '2026-03-23T00:00:00.000Z',
          sha: 'abc123',
        },
        merged: true,
        mergedAt: '2026-03-23T00:10:00.000Z',
        cleaned: false,
      },
    },
  })

  const { tasks: views } = buildTaskViews([task])

  expect(views[0]?.gitClosure).toMatchObject({
    review: {
      passed: true,
      at: '2026-03-23T00:00:00.000Z',
      sha: 'abc123',
    },
    merged: true,
    mergedAt: '2026-03-23T00:10:00.000Z',
    cleaned: true,
  })
})

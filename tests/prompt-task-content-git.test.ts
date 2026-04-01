import { expect, test } from 'vitest'

import { buildTasksPromptPayload } from '../src/foundation/prompting/format.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'

test('buildTasksPromptPayload exposes only truthful git execution fields', () => {
  const task = createTaskFixture({
    id: 'task-git-1',
    repoKey: '/tmp/task-git-1/.git',
    branch: 'hotfix/task-git-1',
    git: {
      worktreePath: '/tmp/task-git-1',
      branch: 'hotfix/task-git-1',
      closureRequired: true,
    },
  })

  const payload = buildTasksPromptPayload([task], [], '/tmp')

  expect(payload?.tasks[0]).toMatchObject({
    id: 'task-git-1',
    git: {
      worktree_path: 'task-git-1',
      branch: 'hotfix/task-git-1',
    },
  })
  for (const field of [
    'git.review_status',
    'git.merge_status',
    'git.cleanup_status',
  ])
    expect(payload?.tasks[0]).not.toHaveProperty(field)
})

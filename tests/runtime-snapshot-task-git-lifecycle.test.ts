import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
} from '../src/storage/runtime-snapshot.js'
import { createTaskFixture } from './helpers/runtime-snapshot.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-snapshot-task-git-'))

test('runtime snapshot preserves explicit task git lifecycle timestamps', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [
      createTaskFixture({
        id: 'task-git-runtime',
        status: 'succeeded',
        completedAt: '2026-03-23T00:30:00.000Z',
        git: {
          worktreePath: '/tmp/task-git-runtime',
          branch: 'feature/task-git-runtime',
          lifecycle: {
            review: {
              passed: true,
              at: '2026-03-23T00:10:00.000Z',
              sha: 'abc123',
            },
            merged: true,
            mergedAt: '2026-03-23T00:20:00.000Z',
            cleaned: true,
            cleanedAt: '2026-03-23T00:25:00.000Z',
          },
        },
      }),
    ],
    taskPlans: [],
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.tasks[0]?.git?.lifecycle).toMatchObject({
    review: {
      passed: true,
      at: '2026-03-23T00:10:00.000Z',
      sha: 'abc123',
    },
    merged: true,
    mergedAt: '2026-03-23T00:20:00.000Z',
    cleaned: true,
    cleanedAt: '2026-03-23T00:25:00.000Z',
  })
})

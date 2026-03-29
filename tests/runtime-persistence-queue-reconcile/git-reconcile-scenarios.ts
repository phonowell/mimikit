import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  hydrateRuntimeState,
  persistRuntimeState,
} from '../../src/kernel/orchestrator/runtime-persistence.js'
import { saveRuntimeSnapshot } from '../../src/persistence/storage/runtime-snapshot.js'
import { createTaskFixture } from '../helpers/runtime-snapshot.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-persistence-git-'))

test('hydrateRuntimeState reconciles derived git closure into task truth source and persisted snapshot', async () => {
  const stateDir = await createTmpDir()
  const missingWorktreePath = join(stateDir, 'missing-worktree')
  await saveRuntimeSnapshot(stateDir, {
    tasks: [
      createTaskFixture({
        id: 'task-git-reconcile',
        status: 'succeeded',
        completedAt: '2026-02-06T00:02:00.000Z',
        git: {
          worktreePath: missingWorktreePath,
          branch: 'feature/task-git-reconcile',
          lifecycle: {
            review: { passed: false },
            merged: false,
            cleaned: false,
          },
        },
        result: {
          taskId: 'task-git-reconcile',
          status: 'succeeded',
          ok: true,
          output: 'done',
          durationMs: 1,
          completedAt: '2026-02-06T00:02:00.000Z',
          handoff: {
            summary: 'done',
            git: {
              worktreePath: missingWorktreePath,
              branch: 'feature/task-git-reconcile',
              lifecycle: {
                review: { passed: false },
                merged: false,
                cleaned: false,
              },
            },
          },
        },
      }),
    ],
    taskPlans: [],
  })

  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
  })

  await hydrateRuntimeState(runtime)

  expect(runtime.tasks[0]?.git?.lifecycle?.cleaned).toBe(true)
  expect(runtime.tasks[0]?.result?.handoff?.git?.lifecycle?.cleaned).toBe(true)

  await persistRuntimeState(runtime)

  const persistedSnapshot = JSON.parse(
    await readFile(join(stateDir, 'runtime-snapshot.json'), 'utf8'),
  ) as {
    tasks?: Array<{
      git?: { lifecycle?: { cleaned?: boolean } }
      result?: { handoff?: { git?: { lifecycle?: { cleaned?: boolean } } } }
    }>
  }

  expect(persistedSnapshot.tasks?.[0]?.git?.lifecycle?.cleaned).toBe(true)
  expect(
    persistedSnapshot.tasks?.[0]?.result?.handoff?.git?.lifecycle?.cleaned,
  ).toBe(true)
})

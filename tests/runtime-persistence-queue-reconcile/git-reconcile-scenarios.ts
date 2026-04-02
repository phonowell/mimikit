import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  hydrateRuntimeState,
  persistRuntimeState,
} from '../../src/kernel/orchestrator/runtime-persistence.js'
import { saveRuntimeSnapshot } from '../../src/persistence/storage/runtime-snapshot.js'
import {
  appendTaskResultArchive,
  readTaskResultArchive,
} from '../../src/persistence/storage/task-results.js'
import { materializeTaskFixture } from '../helpers/execution-spec.js'
import { createTaskFixture } from '../helpers/runtime-snapshot.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-persistence-git-'))

test('hydrateRuntimeState reconciles derived git closure into task truth source and persisted snapshot', async () => {
  const stateDir = await createTmpDir()
  const missingWorktreePath = join(stateDir, 'missing-worktree')
  const archivePath = await appendTaskResultArchive(stateDir, {
    taskId: 'task-git-reconcile',
    focusId: 'focus-global',
    title: 'Task Git Reconcile',
    status: 'succeeded',
    taskStatus: 'succeeded',
    prompt: 'reconcile git lifecycle',
    output: 'done',
    createdAt: '2026-02-06T00:00:00.000Z',
    completedAt: '2026-02-06T00:02:00.000Z',
    durationMs: 1,
    handoff: {
      summary: 'done',
      git: {
        worktreePath: missingWorktreePath,
        branch: 'feature/task-git-reconcile',
        closureRequired: true,
        lifecycle: {
          review: { passed: false },
          merged: false,
          cleaned: false,
        },
      },
    },
  })
  const task = await materializeTaskFixture({
    stateDir,
    task: {
      ...createTaskFixture({
        id: 'task-git-reconcile',
        status: 'succeeded',
        completedAt: '2026-02-06T00:02:00.000Z',
        repoKey: '/tmp/task-git-reconcile/.git',
        branch: 'feature/task-git-reconcile',
        git: {
          worktreePath: missingWorktreePath,
          branch: 'feature/task-git-reconcile',
          closureRequired: true,
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
          archivePath,
          handoff: {
            summary: 'done',
            git: {
              worktreePath: missingWorktreePath,
              branch: 'feature/task-git-reconcile',
              closureRequired: true,
              lifecycle: {
                review: { passed: false },
                merged: false,
                cleaned: false,
              },
            },
          },
        },
      }),
      prompt: 'reconcile git lifecycle',
    },
  })
  await saveRuntimeSnapshot(stateDir, {
    tasks: [task],
    taskPlans: [],
  })

  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
  })

  await hydrateRuntimeState(runtime)

  expect(runtime.domain.tasks[0]?.git?.lifecycle?.cleaned).toBe(true)
  expect(
    runtime.domain.tasks[0]?.result?.handoff?.git?.lifecycle?.cleaned,
  ).toBe(true)
  expect(
    (await readTaskResultArchive(archivePath))?.handoff?.git?.lifecycle
      ?.cleaned,
  ).toBe(true)

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
  expect(
    (await readTaskResultArchive(archivePath))?.handoff?.git?.lifecycle
      ?.cleaned,
  ).toBe(true)
})

import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  hydrateRuntimeState,
  persistRuntimeState,
} from '../../src/kernel/orchestrator/runtime-persistence.js'
import { saveRuntimeSnapshot } from '../../src/persistence/storage/runtime-snapshot.js'
import { readTaskResultArchive } from '../../src/persistence/storage/task-results.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

import { buildClosurePromotionFixtures } from './git-closure-promotion-fixtures.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-persistence-git-'))

test(
  'hydrateRuntimeState promotes closure-task git truth back into the source task referenced by contextRefs',
  { timeout: 30000 },
  async () => {
    const stateDir = await createTmpDir()
    const {
      sourceArchivePath,
      sourceTask,
      closureTask,
      expectedClosurePromotionLifecycle,
    } = await buildClosurePromotionFixtures(stateDir)
    await saveRuntimeSnapshot(stateDir, {
      tasks: [sourceTask, closureTask],
      taskPlans: [],
    })

    const runtime = await createTestRuntimeState({
      workDir: stateDir,
      withGlobalFocus: false,
    })

    await hydrateRuntimeState(runtime)

    const hydratedSourceTask = runtime.domain.tasks.find(
      (task) => task.id === 'task-source-closure-truth',
    )
    expect(hydratedSourceTask?.status).toBe('succeeded')
    expect(hydratedSourceTask?.git?.lifecycle).toMatchObject({
      ...expectedClosurePromotionLifecycle,
    })
    expect(hydratedSourceTask?.result).toMatchObject({
      taskStatus: 'succeeded',
      outcome: 'completed',
      stopReason: 'completed',
    })
    expect(hydratedSourceTask?.result?.handoff?.git?.lifecycle).toMatchObject({
      ...expectedClosurePromotionLifecycle,
    })
    expect(await readTaskResultArchive(sourceArchivePath)).toMatchObject({
      taskStatus: 'succeeded',
      outcome: 'completed',
      stopReason: 'completed',
      handoff: {
        git: {
          lifecycle: {
            ...expectedClosurePromotionLifecycle,
          },
        },
      },
    })

    await persistRuntimeState(runtime)

    const persistedSnapshot = JSON.parse(
      await readFile(join(stateDir, 'runtime-snapshot.json'), 'utf8'),
    ) as {
      tasks?: Array<{
        id: string
        git?: { lifecycle?: { merged?: boolean; cleaned?: boolean } }
        result?: {
          handoff?: {
            git?: { lifecycle?: { merged?: boolean; cleaned?: boolean } }
          }
        }
      }>
    }
    const persistedSourceTask = persistedSnapshot.tasks?.find(
      (task) => task.id === 'task-source-closure-truth',
    )
    expect(persistedSourceTask?.git?.lifecycle).toMatchObject({
      merged: true,
      cleaned: true,
    })
    expect(persistedSourceTask?.result?.handoff?.git?.lifecycle).toMatchObject({
      merged: true,
      cleaned: true,
    })
    expect(persistedSourceTask?.status).toBe('succeeded')
    expect(persistedSourceTask?.result).toMatchObject({
      taskStatus: 'succeeded',
      outcome: 'completed',
      stopReason: 'completed',
    })
  },
)

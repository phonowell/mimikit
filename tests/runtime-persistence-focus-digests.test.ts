import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { persistRuntimeState } from '../src/orchestrator/core/runtime-persistence.js'
import { loadRuntimeSnapshot } from '../src/storage/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const SNAPSHOT_BASE_TIME = '2026-02-06T00:00:00.000Z'
const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-persistence-focus-digests-'))

test('persistRuntimeState writes focus details on focuses and strips global focus details', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    patch: {
      focuses: [
        {
          id: 'focus-global',
          title: 'Global',
          status: 'active',
          createdAt: SNAPSHOT_BASE_TIME,
          updatedAt: SNAPSHOT_BASE_TIME,
          lastActivityAt: SNAPSHOT_BASE_TIME,
          summary: 'legacy global detail',
        },
        {
          id: 'focus-release',
          title: 'Release',
          status: 'active',
          createdAt: SNAPSHOT_BASE_TIME,
          updatedAt: SNAPSHOT_BASE_TIME,
          lastActivityAt: SNAPSHOT_BASE_TIME,
          summary: 'ship phase2',
        },
      ],
    },
  })

  await persistRuntimeState(runtime)

  expect(runtime.focuses.find((item) => item.id === 'focus-global')?.summary).toBe(
    'legacy global detail',
  )
  expect((await loadRuntimeSnapshot(stateDir)).focuses).toEqual([
    expect.objectContaining({
      id: 'focus-global',
      title: 'Global',
      status: 'active',
      createdAt: SNAPSHOT_BASE_TIME,
      updatedAt: SNAPSHOT_BASE_TIME,
      lastActivityAt: SNAPSHOT_BASE_TIME,
    }),
    expect.objectContaining({
      id: 'focus-release',
      summary: 'ship phase2',
    }),
  ])
})

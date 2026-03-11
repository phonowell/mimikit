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

test('persistRuntimeState keeps runtime focus digests intact while filtering snapshot payload', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    patch: {
      focusDigests: [
        {
          focusId: 'focus-global',
          summary: 'legacy global digest',
          updatedAt: SNAPSHOT_BASE_TIME,
        },
        {
          focusId: 'focus-release',
          summary: 'ship phase2',
          updatedAt: SNAPSHOT_BASE_TIME,
        },
      ],
    },
  })

  await persistRuntimeState(runtime)

  expect(runtime.focusDigests.map((item) => item.focusId)).toEqual([
    'focus-global',
    'focus-release',
  ])
  expect((await loadRuntimeSnapshot(stateDir)).focusDigests?.map((item) => item.focusId)).toEqual([
    'focus-release',
  ])
})

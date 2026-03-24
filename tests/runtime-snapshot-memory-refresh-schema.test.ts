import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { loadRuntimeSnapshot } from '../src/persistence/storage/runtime-snapshot.js'
import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../src/persistence/storage/runtime-schema-version.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-snapshot-memory-refresh-'))

test('runtime snapshot rejects legacy memoryRefresh checkpoint fields', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      tasks: [],
      taskPlans: [],
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
      memoryRefresh: {
        lastCompletedTurn: 0,
        signalVersion: 0,
        lastProcessedSignalVersion: 0,
        lastProcessedResultsCursor: 0,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { loadRuntimeSnapshot } from '../../src/persistence/storage/runtime-snapshot.js'
import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../../src/persistence/storage/runtime-schema-version.js'
import {
  GLOBAL_FOCUS_ID,
  SNAPSHOT_BASE_TIME,
} from '../helpers/runtime-snapshot.js'

import { createTmpDir } from './testkit.js'

test('runtime snapshot rejects legacy single pendingUserChoice field', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      tasks: [],
      taskPlans: [],
      pendingUserChoice: {
        id: 'choice-legacy',
        question: 'continue?',
        options: [
          { id: 'option-yes', label: 'Yes', reason: 'continue' },
          { id: 'option-no', label: 'No', reason: 'stop' },
        ],
        defaultOptionId: 'option-no',
        createdAt: SNAPSHOT_BASE_TIME,
        focusId: GLOBAL_FOCUS_ID,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

test('runtime snapshot rejects legacy next fields', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      tasks: [
        {
          id: 'task-legacy-next',
          fingerprint: 'task-legacy-next',
          prompt: 'legacy',
          title: 'legacy',
          cwd: '/tmp/runtime-snapshot-legacy-next',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          provider: 'codex',
          status: 'pending',
          createdAt: '2026-02-06T00:00:00.000Z',
          next: [{ prompt: 'next task', condition: 'succeeded' }],
        },
      ],
      taskPlans: [],
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

test('runtime snapshot rejects legacy extra fields during load', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: 'runtime-snapshot.v6',
      tasks: [],
      taskPlans: [],
      pendingUserChoice: {
        id: 'choice-legacy',
        question: 'legacy',
        options: [
          { id: 'option-a', label: 'A', reason: 'a' },
          { id: 'option-b', label: 'B', reason: 'b' },
        ],
        defaultOptionId: 'option-b',
        createdAt: SNAPSHOT_BASE_TIME,
        focusId: GLOBAL_FOCUS_ID,
      },
      managerCompressedContext: 'legacy-summary',
      managerPacketSummary: 'legacy-packet-summary',
      managerLastUsage: { input: 1, output: 2, total: 3 },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

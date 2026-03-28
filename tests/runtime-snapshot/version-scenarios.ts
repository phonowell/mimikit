import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../../src/persistence/storage/runtime-schema-version.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
} from '../../src/persistence/storage/runtime-snapshot.js'
import {
  createPlanFixture,
  GLOBAL_FOCUS_ID,
  SNAPSHOT_BASE_TIME,
} from '../helpers/runtime-snapshot.js'

import { createTmpDir } from './testkit.js'

test('runtime snapshot rejects snapshot without schemaVersion', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      tasks: [],
      taskPlans: [],
      queues: {
        inputsCursor: 1,
        resultsCursor: 2,
      },
    }),
    'utf8',
  )
  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow(
    /schema version not supported/i,
  )
})

test('runtime snapshot rejects older schema version', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: 'runtime-snapshot.v2',
      tasks: [],
      taskPlans: [],
      queues: {
        inputsCursor: 1,
        resultsCursor: 2,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow(
    /schema version not supported/i,
  )
})

test('runtime snapshot rejects unsupported future schema version', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: 'runtime-snapshot.v99',
      tasks: [],
      taskPlans: [],
      queues: {
        inputsCursor: 1,
        resultsCursor: 2,
      },
    }),
    'utf8',
  )
  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow(
    /schema version not supported/i,
  )
})

test('runtime snapshot accepts on_worker_slot_freed trigger', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [],
    taskPlans: [
      createPlanFixture({
        id: 'plan-capacity',
        trigger: {
          mode: 'on_worker_slot_freed',
        },
      }),
    ],
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.taskPlans).toHaveLength(1)
  expect(loaded.taskPlans[0]?.trigger.mode).toBe('on_worker_slot_freed')
})

test('loadRuntimeSnapshot rejects legacy worker-slot trigger mode', async () => {
  const stateDir = await createTmpDir()
  const snapshotPath = join(stateDir, 'runtime-snapshot.json')
  await writeFile(
    snapshotPath,
    JSON.stringify({
      tasks: [],
      taskPlans: [
        {
          id: 'plan-legacy-capacity',
          prompt: 'legacy',
          title: 'legacy',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          priority: 'normal',
          source: 'user_request',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_available',
          },
          createdAt: SNAPSHOT_BASE_TIME,
          updatedAt: SNAPSHOT_BASE_TIME,
          runtime: { runCount: 0 },
        },
      ],
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

test('loadRuntimeSnapshot migrates legacy plan template fields into root effect fields', async () => {
  const stateDir = await createTmpDir()
  const snapshotPath = join(stateDir, 'runtime-snapshot.json')
  const legacyPlan = createPlanFixture({
    id: 'plan-legacy-semantic',
  })
  await writeFile(
    snapshotPath,
    JSON.stringify({
      schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      tasks: [],
      taskPlans: [
        {
          ...legacyPlan,
          effect: {
            kind: 'enqueue_task',
            taskTemplate: {
              ...legacyPlan.effect.taskTemplate,
              contract: {
                goal: 'Legacy contract goal',
                scope: 'Legacy contract scope',
                acceptance: ['Legacy acceptance'],
              },
              fingerprint: 'legacy-plan-task-key',
              semanticKey: 'legacy-plan-semantic-key',
            },
          },
        },
      ],
      queues: {
        inputsCursor: 1,
        resultsCursor: 2,
      },
    }),
    'utf8',
  )

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.taskPlans[0]?.effect.taskKey).toBe('legacy-plan-task-key')
  expect(loaded.taskPlans[0]?.effect.taskContract).toMatchObject({
    goal: 'Legacy contract goal',
    scope: 'Legacy contract scope',
    acceptance: ['Legacy acceptance'],
  })
  expect(loaded.taskPlans[0]?.effect.taskTemplate).not.toHaveProperty(
    'semanticKey',
  )
  expect(loaded.taskPlans[0]?.effect.taskTemplate).not.toHaveProperty(
    'contract',
  )
  expect(loaded.taskPlans[0]?.effect.taskTemplate).not.toHaveProperty(
    'fingerprint',
  )
})

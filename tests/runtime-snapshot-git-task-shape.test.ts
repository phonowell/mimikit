import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../src/persistence/storage/runtime-schema-version.js'
import { loadRuntimeSnapshot } from '../src/persistence/storage/runtime-snapshot.js'

import {
  GLOBAL_FOCUS_ID,
  SNAPSHOT_BASE_TIME,
} from './helpers/runtime-snapshot.js'
import { createTmpDir } from './runtime-snapshot/testkit.js'

test('runtime snapshot rejects git task without repoKey/branch truth source', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      tasks: [
        {
          id: 'task-legacy-git-missing-repo',
          fingerprint: 'task-legacy-git-missing-repo',
          semanticKey: 'task-legacy-git-missing-repo',
          executionSpecId: 'spec-task-legacy-git-missing-repo',
          title: 'legacy git task',
          cwd: '/tmp/runtime-snapshot-legacy-git',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          provider: 'codex',
          status: 'pending',
          createdAt: SNAPSHOT_BASE_TIME,
          git: {
            worktreePath: '/tmp/runtime-snapshot-legacy-git',
            branch: 'task/legacy-git',
            closureRequired: true,
          },
        },
      ],
      taskPlans: [],
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow(
    'task git requires repoKey and branch',
  )
})

test('runtime snapshot rejects git task without closureRequired', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      tasks: [
        {
          id: 'task-legacy-git-missing-closure',
          fingerprint: 'task-legacy-git-missing-closure',
          semanticKey: 'task-legacy-git-missing-closure',
          executionSpecId: 'spec-task-legacy-git-missing-closure',
          title: 'legacy git task',
          cwd: '/tmp/runtime-snapshot-legacy-git',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          provider: 'codex',
          status: 'pending',
          createdAt: SNAPSHOT_BASE_TIME,
          repoKey: '/tmp/runtime-snapshot-legacy-git/.git',
          branch: 'task/legacy-git',
          git: {
            worktreePath: '/tmp/runtime-snapshot-legacy-git',
            branch: 'task/legacy-git',
          },
        },
      ],
      taskPlans: [],
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow(
    'expected boolean',
  )
})

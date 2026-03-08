import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendTaskResultArchive,
  readTaskResultArchive,
} from '../src/storage/task-results.js'
import { buildResult } from '../src/worker/result-finalize.js'
import { buildTaskEvidence } from '../src/worker/result-evidence.js'

import type { Task } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-contract-archive-'))

test('task evidence roundtrip keeps contract goal and acceptance checks', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-contract-1',
    fingerprint: 'fp',
    prompt: 'Build release checklist',
    title: 'Release checklist',
    contract: {
      goal: 'Prepare release checklist',
      scope: 'Collect top-level release items',
      acceptance: ['Checklist has at least 3 items'],
      contextRefs: ['focus:release'],
    },
    focusId: 'focus-release',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-03-08T00:00:00.000Z',
  }

  const result = buildResult(
    task,
    'succeeded',
    '- [x] item 1\n- [x] item 2\n- [x] item 3',
    1200,
  )
  result.evidence = buildTaskEvidence({
    task,
    result,
    previousStatus: 'running',
  })
  const archivedPath = await appendTaskResultArchive(stateDir, {
    taskId: task.id,
    focusId: task.focusId,
    title: task.title,
    status: result.status,
    provider: task.provider,
    prompt: task.prompt,
    output: result.output,
    createdAt: task.createdAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ...(result.evidence ? { evidence: result.evidence } : {}),
  })

  const parsed = await readTaskResultArchive(archivedPath, task.id)
  expect(parsed?.evidence?.contractGoal).toBe('Prepare release checklist')
  expect(parsed?.evidence?.acceptanceChecks).toHaveLength(1)
  expect(parsed?.evidence?.stateDelta.taskStatusTo).toBe('succeeded')
})

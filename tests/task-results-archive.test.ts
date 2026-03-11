import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendTaskResultArchive,
  readTaskResultArchive,
  readTaskResultsForTasks,
} from '../src/storage/task-results.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-archive-'))

const archiveEntry = {
  taskId: 'task-archive-1',
  title: 'Archive Collision',
  status: 'succeeded' as const,
  provider: 'opencode' as const,
  prompt: 'Prompt',
  output: 'Output',
  createdAt: '2026-03-03T00:00:00.000Z',
  completedAt: '2026-03-03T00:00:02.000Z',
  durationMs: 2,
}

test('appendTaskResultArchive resolves filename collisions by suffix', async () => {
  const stateDir = await createTmpDir()
  const firstPath = await appendTaskResultArchive(stateDir, archiveEntry)
  const secondPath = await appendTaskResultArchive(stateDir, archiveEntry)

  expect(firstPath).not.toBe(secondPath)
  expect(secondPath.endsWith('_01.md')).toBe(true)
  await expect(access(firstPath)).resolves.toBeUndefined()
  await expect(access(secondPath)).resolves.toBeUndefined()
})

test('readTaskResultArchive restores provider and handoff payload', async () => {
  const stateDir = await createTmpDir()
  const path = await appendTaskResultArchive(stateDir, {
    ...archiveEntry,
    taskStatus: 'succeeded',
    outcome: 'completed',
    stopReason: 'completed',
    cancel: { source: 'user', reason: 'requested' },
    handoff: {
      summary: 'Done',
      artifacts: [{ path: 'tasks/2026-03-03/task-archive-1.md', kind: 'task_archive' }],
      evidence: [{ type: 'task_archive', ref: 'tasks/2026-03-03/task-archive-1.md' }],
    },
    evidence: {
      status: 'done',
      contractGoal: 'Archive task outcome',
      acceptanceChecks: [{ criterion: 'Archive exists', met: true }],
      stateDelta: { taskStatusFrom: 'running', taskStatusTo: 'succeeded' },
      nextSteps: ['Notify reviewer'],
    },
  })

  const parsed = await readTaskResultArchive(path)
  expect(parsed?.provider).toBe('opencode')
  expect(parsed?.taskStatus).toBe('succeeded')
  expect(parsed?.outcome).toBe('completed')
  expect(parsed?.stopReason).toBe('completed')
  expect(parsed?.cancel).toMatchObject({ source: 'user', reason: 'requested' })
  expect(parsed?.handoff?.evidence?.[0]).toMatchObject({
    type: 'task_archive',
  })
  expect(parsed?.evidence).toMatchObject({
    status: 'done',
    contractGoal: 'Archive task outcome',
    stateDelta: { taskStatusFrom: 'running', taskStatusTo: 'succeeded' },
  })
})

test('readTaskResultArchive ignores empty handoff payload', async () => {
  const stateDir = await createTmpDir()
  const path = await appendTaskResultArchive(stateDir, {
    ...archiveEntry,
    handoff: {},
  })

  const parsed = await readTaskResultArchive(path)
  expect(parsed?.handoff).toBeUndefined()
})

test('readTaskResultsForTasks keeps the newest archive for a task on same day', async () => {
  const stateDir = await createTmpDir()
  await appendTaskResultArchive(stateDir, {
    ...archiveEntry,
    output: 'old output',
    completedAt: '2026-03-03T00:00:02.000Z',
  })
  await appendTaskResultArchive(stateDir, {
    ...archiveEntry,
    output: 'new output',
    completedAt: '2026-03-03T00:05:00.000Z',
  })

  const [parsed] = await readTaskResultsForTasks(stateDir, [archiveEntry.taskId])

  expect(parsed?.output).toBe('new output')
  expect(parsed?.completedAt).toBe('2026-03-03T00:05:00.000Z')
  expect(parsed?.archivePath?.endsWith('_01.md')).toBe(true)
})

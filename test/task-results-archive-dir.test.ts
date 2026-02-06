import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendTaskResultArchive,
  readTaskResultsForTasks,
} from '../src/storage/task-results.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-results-'))

test('appendTaskResultArchive writes into tasks directory', async () => {
  const stateDir = await createTmpDir()
  const archivePath = await appendTaskResultArchive(stateDir, {
    taskId: 'task-001',
    title: 'archive target',
    status: 'succeeded',
    prompt: 'prompt',
    output: 'output',
    createdAt: '2026-02-06T00:00:00.000Z',
    completedAt: '2026-02-06T00:01:00.000Z',
    durationMs: 123,
  })
  expect(archivePath.includes(`${sep}tasks${sep}2026-02-06${sep}`)).toBe(true)
  const content = await readFile(archivePath, 'utf8')
  expect(content.includes('=== RESULT ===')).toBe(true)
})

test('readTaskResultsForTasks reads from tasks directory', async () => {
  const stateDir = await createTmpDir()
  const archivePath = await appendTaskResultArchive(stateDir, {
    taskId: 'task-002',
    title: 'read target',
    status: 'succeeded',
    prompt: 'prompt',
    output: 'output',
    createdAt: '2026-02-06T00:00:00.000Z',
    completedAt: '2026-02-06T00:01:00.000Z',
    durationMs: 1000,
  })

  const results = await readTaskResultsForTasks(stateDir, ['task-002'], {
    dateHints: { 'task-002': '2026-02-06' },
  })

  expect(results).toHaveLength(1)
  expect(results[0]?.taskId).toBe('task-002')
  expect(results[0]?.archivePath).toBe(archivePath)
})

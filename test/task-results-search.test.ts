import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendTaskResultArchive,
  queryTaskResultArchives,
} from '../src/storage/task-results.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-archive-search-'))

test('queryTaskResultArchives returns top hits for query text', async () => {
  const stateDir = await createTmpDir()
  await appendTaskResultArchive(stateDir, {
    taskId: 'task-release-1',
    title: 'Release Notes',
    status: 'succeeded',
    prompt: 'summarize release plan',
    output: 'Generated release notes and deployment checklist.',
    createdAt: '2026-03-04T00:00:00.000Z',
    completedAt: '2026-03-04T00:01:00.000Z',
    durationMs: 20,
  })
  await appendTaskResultArchive(stateDir, {
    taskId: 'task-docs-1',
    title: 'Docs',
    status: 'succeeded',
    prompt: 'update docs',
    output: 'Refreshed API examples.',
    createdAt: '2026-03-04T00:00:00.000Z',
    completedAt: '2026-03-04T00:02:00.000Z',
    durationMs: 15,
  })

  const hits = await queryTaskResultArchives(stateDir, 'release checklist', {
    limit: 3,
  })

  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0]?.taskId).toBe('task-release-1')
  expect(hits[0]?.archivePath).toContain('task-release-1')
  expect(hits[0]?.score).toBeGreaterThan(0)
})

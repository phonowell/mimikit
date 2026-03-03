import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { appendTaskResultArchive } from '../src/storage/task-results.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-archive-'))

const archiveEntry = {
  taskId: 'task-archive-1',
  title: 'Archive Collision',
  status: 'succeeded' as const,
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

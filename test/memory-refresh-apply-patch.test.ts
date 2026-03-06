import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { readMemoryEntries, writeMemoryEntries } from '../src/memory/store.js'
import { applyMemoryPatch } from '../src/memory/refresh/apply-patch.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-memory-refresh-'))

test('applyMemoryPatch deletes entries selected by refresh output', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  await writeMemoryEntries(memoryPath, [
    {
      id: 'memory-keep',
      title: 'Keep',
      content: 'Keep this preference.',
      updatedAt: '2026-03-01T00:00:00.000Z',
      source: 'remember',
    },
    {
      id: 'memory-drop',
      title: 'Drop',
      content: 'Forget this old preference.',
      updatedAt: '2026-03-01T00:00:00.000Z',
      source: 'remember',
    },
  ])

  const result = await applyMemoryPatch(memoryPath, {
    entries: [],
    deleteEntryIds: ['memory-drop'],
    scoreContext: {
      queryText: '',
      mentionTexts: [],
      workingFocusIds: [],
    },
  })
  expect(result.deleted).toBe(1)
  expect(result.written).toBe(0)
  const entries = await readMemoryEntries(memoryPath)
  expect(entries.map((item) => item.id)).toEqual(['memory-keep'])
})

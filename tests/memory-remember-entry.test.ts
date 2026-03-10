import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { parseMemoryEntries } from '../src/memory/entry-codec.js'
import { rememberMemoryEntry } from '../src/memory/remember-entry.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-remember-memory-'))

test('rememberMemoryEntry writes a managed memory section for new entry', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  const result = await rememberMemoryEntry(memoryPath, {
    content: 'User prefers concise Chinese responses.',
  })

  expect(result.operation).toBe('created')
  expect(result.entryId.startsWith('memory-')).toBe(true)
  const markdown = await readFile(memoryPath, 'utf8')
  expect(markdown).toContain('## [memory-entry] (id:')
  expect(markdown).toContain('User prefers concise Chinese responses.')
  const entries = parseMemoryEntries(markdown)
  expect(entries).toHaveLength(1)
  expect(entries[0]?.category).toBe('general')
  expect(entries[0]?.dedupeKey.startsWith('auto-')).toBe(true)
})

test('rememberMemoryEntry dedupes same content to noop', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')

  const created = await rememberMemoryEntry(memoryPath, {
    content: 'Always show command outputs in UTC.',
  })
  const noop = await rememberMemoryEntry(memoryPath, {
    content: 'Always show command outputs in UTC.',
  })

  expect(noop.operation).toBe('noop')
  expect(noop.dedupeKey).toBe(created.dedupeKey)
  const markdown = await readFile(memoryPath, 'utf8')
  const entries = parseMemoryEntries(markdown).filter(
    (item) => item.dedupeKey === created.dedupeKey,
  )
  expect(entries).toHaveLength(1)
})

test('rememberMemoryEntry merges when dedupe key is stable', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  const prefix = 'x'.repeat(72)

  const created = await rememberMemoryEntry(memoryPath, {
    content: `${prefix}-first`,
  })
  const merged = await rememberMemoryEntry(memoryPath, {
    content: `${prefix}-second`,
  })

  expect(merged.operation).toBe('merged')
  expect(merged.dedupeKey).toBe(created.dedupeKey)
  const markdown = await readFile(memoryPath, 'utf8')
  const entries = parseMemoryEntries(markdown).filter(
    (item) => item.dedupeKey === created.dedupeKey,
  )
  expect(entries).toHaveLength(1)
  expect(entries[0]?.content).toContain(`${prefix}-first`)
  expect(entries[0]?.content).toContain(`${prefix}-second`)
})

test('rememberMemoryEntry truncates long content to fixed limit', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  const longContent = 'x'.repeat(700)
  const result = await rememberMemoryEntry(memoryPath, {
    content: longContent,
  })

  expect(result.contentChars).toBe(480)
  const markdown = await readFile(memoryPath, 'utf8')
  expect(markdown).toContain('x'.repeat(480))
  expect(markdown).not.toContain('x'.repeat(560))
})

test('rememberMemoryEntry serializes concurrent writes on same dedupe key', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  const prefix = 'p'.repeat(72)
  const writes = Array.from({ length: 6 }, (_, index) =>
    rememberMemoryEntry(memoryPath, {
      content: `${prefix}\n\nparallel-note-${index + 1}`,
    }),
  )
  const results = await Promise.all(writes)
  const dedupeKeys = new Set(results.map((item) => item.dedupeKey))

  expect(dedupeKeys.size).toBe(1)
  const dedupeKey = results[0]?.dedupeKey
  expect(dedupeKey).toBeDefined()
  const markdown = await readFile(memoryPath, 'utf8')
  const entries = parseMemoryEntries(markdown).filter(
    (item) => item.dedupeKey === dedupeKey,
  )
  expect(entries).toHaveLength(1)
  for (let index = 0; index < 6; index += 1)
    expect(markdown).toContain(`parallel-note-${index + 1}`)
})

test('parseMemoryEntries ignores non-canonical legacy headings', () => {
  const markdown = [
    '## [memory-entry:general:auto-1] (id:memory-legacy)',
    'title: legacy remember',
    'updated_at: 2026-03-11T00:00:00.000Z',
    'source: remember',
    '',
    'legacy body',
    '',
    '## Legacy note (2026-03-11T00:00:00.000Z)',
    'title: legacy refresh',
    'updated_at: 2026-03-11T00:00:00.000Z',
    'source: refresh',
    '',
    'legacy refresh body',
  ].join('\n')

  expect(parseMemoryEntries(markdown)).toEqual([])
})

test('rememberMemoryEntry rejects non-canonical legacy headings instead of overwriting them', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  await mkdir(join(workDir, 'memory'), { recursive: true })
  await writeFile(
    memoryPath,
    [
      '## [memory-entry:general:auto-1] (id:memory-legacy)',
      'title: legacy remember',
      'updated_at: 2026-03-11T00:00:00.000Z',
      'source: remember',
      '',
      'legacy body',
    ].join('\n'),
    'utf8',
  )

  await expect(
    rememberMemoryEntry(memoryPath, {
      content: 'new memory entry',
    }),
  ).rejects.toThrow(/memory heading format not supported/i)
})

import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { rememberMemoryEntry } from '../src/memory/remember-entry.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-remember-memory-'))

test('rememberMemoryEntry writes a managed memory section for new entry', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  const result = await rememberMemoryEntry(memoryPath, {
    content: 'User prefers concise Chinese responses.',
    category: 'preference',
    dedupeKey: 'response-language',
  })

  expect(result.operation).toBe('created')
  expect(result.entryId.startsWith('memory-')).toBe(true)
  const markdown = await readFile(memoryPath, 'utf8')
  expect(markdown).toContain(
    '## [memory-entry:preference:response-language] (id:',
  )
  expect(markdown).toContain('User prefers concise Chinese responses.')
})

test('rememberMemoryEntry merge policy dedupes existing content', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')

  await rememberMemoryEntry(memoryPath, {
    content: 'Always show command outputs in UTC.',
    category: 'workflow',
    dedupeKey: 'timezone',
    replacePolicy: 'merge',
  })
  const noop = await rememberMemoryEntry(memoryPath, {
    content: 'Always show command outputs in UTC.',
    category: 'workflow',
    dedupeKey: 'timezone',
    replacePolicy: 'merge',
  })
  const merged = await rememberMemoryEntry(memoryPath, {
    content: 'Prefer absolute dates in final responses.',
    category: 'workflow',
    dedupeKey: 'timezone',
    replacePolicy: 'merge',
  })

  expect(noop.operation).toBe('noop')
  expect(merged.operation).toBe('merged')
  const markdown = await readFile(memoryPath, 'utf8')
  expect((markdown.match(/^## \[memory-entry:workflow:timezone\]/gm) ?? []).length).toBe(1)
  expect(markdown).toContain('Always show command outputs in UTC.')
  expect(markdown).toContain('Prefer absolute dates in final responses.')
})

test('rememberMemoryEntry overwrite policy replaces prior content', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')

  await rememberMemoryEntry(memoryPath, {
    content: 'User prefers verbose answers.',
    category: 'style',
    dedupeKey: 'verbosity',
  })
  const overwritten = await rememberMemoryEntry(memoryPath, {
    content: 'User prefers concise answers by default.',
    category: 'style',
    dedupeKey: 'verbosity',
    replacePolicy: 'overwrite',
  })

  expect(overwritten.operation).toBe('overwritten')
  expect(overwritten.replaced).toBe(true)
  const markdown = await readFile(memoryPath, 'utf8')
  expect(markdown).not.toContain('User prefers verbose answers.')
  expect(markdown).toContain('User prefers concise answers by default.')
})

test('rememberMemoryEntry enforces max_chars truncation', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  const longContent = 'x'.repeat(180)
  const result = await rememberMemoryEntry(memoryPath, {
    content: longContent,
    category: 'fact',
    dedupeKey: 'long-line',
    maxChars: 80,
  })

  expect(result.truncated).toBe(true)
  expect(result.contentChars).toBe(80)
  const markdown = await readFile(memoryPath, 'utf8')
  expect(markdown).toContain('x'.repeat(80))
  expect(markdown).not.toContain('x'.repeat(120))
})

test('rememberMemoryEntry serializes concurrent writes on same key', async () => {
  const workDir = await createTmpDir()
  const memoryPath = join(workDir, 'memory', 'MEMORY.md')
  const writes = Array.from({ length: 6 }, (_, index) =>
    rememberMemoryEntry(memoryPath, {
      content: `parallel-note-${index + 1}`,
      category: 'project',
      dedupeKey: 'parallel',
      replacePolicy: 'append',
    }),
  )
  await Promise.all(writes)

  const markdown = await readFile(memoryPath, 'utf8')
  expect((markdown.match(/^## \[memory-entry:project:parallel\]/gm) ?? []).length).toBe(1)
  for (let index = 0; index < 6; index += 1)
    expect(markdown).toContain(`parallel-note-${index + 1}`)
})

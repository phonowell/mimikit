import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, test } from 'vitest'

import { executeReadFileTool } from '../src/supervisor/read-file-tool.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-read-file-'))

test('executeReadFileTool reads selected window with utf8', async () => {
  const dir = await createTmpDir()
  const path = join(dir, 'sample.ts')
  await writeFile(path, 'a\nb\nc\nd\n', 'utf8')
  const result = await executeReadFileTool(
    { path, start: 2, limit: 2 },
    { defaultLines: 120, maxLines: 240, maxBytes: 12 * 1024 },
  )
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.path).toBe(resolve(path))
  expect(result.start).toBe(2)
  expect(result.end).toBe(3)
  expect(result.totalLines).toBe(5)
  expect(result.content).toBe('b\nc')
  expect(result.truncated).toBe(true)
})

test('executeReadFileTool blocks non-whitelist extension', async () => {
  const dir = await createTmpDir()
  const path = join(dir, 'secret.db')
  await writeFile(path, 'x', 'utf8')
  const result = await executeReadFileTool(
    { path },
    { defaultLines: 120, maxLines: 240, maxBytes: 12 * 1024 },
  )
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.code).toBe('file_type_blocked')
})

test('executeReadFileTool rejects directory path', async () => {
  const dir = await createTmpDir()
  const folder = join(dir, 'nested')
  await mkdir(folder)
  const result = await executeReadFileTool(
    { path: folder },
    { defaultLines: 120, maxLines: 240, maxBytes: 12 * 1024 },
  )
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.code).toBe('file_type_blocked')
})

test('executeReadFileTool truncates by bytes', async () => {
  const dir = await createTmpDir()
  const path = join(dir, 'large.md')
  await writeFile(path, '12345\n67890\nabcde\n', 'utf8')
  const result = await executeReadFileTool(
    { path, start: 1, limit: 10 },
    { defaultLines: 120, maxLines: 240, maxBytes: 11 },
  )
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toBe('12345')
  expect(result.truncated).toBe(true)
})

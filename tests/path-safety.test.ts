import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { checkExistingPathBoundary } from '../src/fs/path-safety.js'

test('checkExistingPathBoundary returns missing when root path is absent', async () => {
  const sandboxDir = await mkdtemp(join(tmpdir(), 'mimikit-path-safety-'))
  const rootPath = join(sandboxDir, '.mimikit-missing')
  const targetPath = join(rootPath, 'tasks', '20990101', 'missing.md')

  await expect(
    checkExistingPathBoundary({
      rootPath,
      targetPath,
    }),
  ).resolves.toBe('missing')
})

test('checkExistingPathBoundary returns inside for existing nested file', async () => {
  const sandboxDir = await mkdtemp(join(tmpdir(), 'mimikit-path-safety-'))
  const rootPath = join(sandboxDir, '.mimikit')
  const nestedDir = join(rootPath, 'tasks', '20990101')
  const targetPath = join(nestedDir, 'result.md')

  await mkdir(nestedDir, { recursive: true })
  await writeFile(targetPath, 'ok', 'utf8')

  await expect(
    checkExistingPathBoundary({
      rootPath,
      targetPath,
    }),
  ).resolves.toBe('inside')
})

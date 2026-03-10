import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { clearStateDir } from '../src/http/helpers.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-http-helpers-'))

test('clearStateDir rejects non-state directories with unexpected entries', async () => {
  const workDir = await createTmpDir()
  const keepPath = join(workDir, 'README.md')
  await writeFile(keepPath, 'keep', 'utf8')

  await expect(clearStateDir(workDir)).rejects.toThrow(
    `refusing to clear unsafe state dir: ${workDir}`,
  )
  await expect(readdir(workDir)).resolves.toContain('README.md')
})

test('clearStateDir clears recognized runtime state directories', async () => {
  const workDir = await createTmpDir()
  await Promise.all([
    mkdir(join(workDir, 'inputs'), { recursive: true }),
    mkdir(join(workDir, 'runtime'), { recursive: true }),
    mkdir(join(workDir, 'tasks'), { recursive: true }),
    writeFile(join(workDir, 'log.jsonl'), '{"ok":true}\n', 'utf8'),
  ])

  await clearStateDir(workDir)

  await expect(readdir(workDir)).resolves.toEqual([])
})

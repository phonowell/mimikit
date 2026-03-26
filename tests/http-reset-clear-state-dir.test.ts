import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { clearStateDir } from '../src/surface/http/state-dir.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-clear-state-dir-'))

test('clearStateDir preserves only instance markers and removes everything else', async () => {
  const rootDir = await createTmpDir()
  const stateDir = join(rootDir, '.mimikit')
  await mkdir(stateDir, { recursive: true })
  await writeFile(join(stateDir, '.instance'), '', 'utf8')
  await mkdir(join(stateDir, '.instance.lock'), { recursive: true })
  await mkdir(join(stateDir, 'specs'), { recursive: true })
  await writeFile(join(stateDir, 'specs', 'spec-1.json'), '{}', 'utf8')
  await writeFile(join(stateDir, 'log.jsonl.txt'), 'safe log fallback', 'utf8')
  await writeFile(
    join(stateDir, '20260326-0000-01-log.jsonl.gz'),
    'gzip-bytes',
    'utf8',
  )
  await mkdir(join(stateDir, 'unknown-dir'), { recursive: true })
  await writeFile(join(stateDir, 'unknown-file.txt'), 'x', 'utf8')

  await clearStateDir(stateDir)

  await expect(readdir(stateDir)).resolves.toEqual([
    '.instance',
    '.instance.lock',
  ])
})

test('clearStateDir rejects non-.mimikit directories', async () => {
  const stateDir = await createTmpDir()
  await writeFile(join(stateDir, 'file.txt'), 'x', 'utf8')

  await expect(clearStateDir(stateDir)).rejects.toThrow(
    `refusing to clear unsafe state dir: ${stateDir}`,
  )
})

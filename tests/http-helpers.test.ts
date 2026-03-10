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
    mkdir(join(workDir, 'generated', 'worker-task-prompts', '2026-03-11'), {
      recursive: true,
    }),
    mkdir(join(workDir, 'history'), { recursive: true }),
    mkdir(join(workDir, 'inputs'), { recursive: true }),
    mkdir(join(workDir, 'memory'), { recursive: true }),
    mkdir(join(workDir, 'results'), { recursive: true }),
    mkdir(join(workDir, 'runtime'), { recursive: true }),
    mkdir(join(workDir, 'task-progress', '2026-03-11'), { recursive: true }),
    mkdir(join(workDir, 'tasks'), { recursive: true }),
    mkdir(join(workDir, 'traces', '2026-03-11'), { recursive: true }),
    mkdir(join(workDir, 'usage'), { recursive: true }),
    writeFile(join(workDir, '.instance'), 'lock', 'utf8'),
    writeFile(join(workDir, 'log.jsonl'), '{"ok":true}\n', 'utf8'),
    writeFile(join(workDir, 'runtime-snapshot.json'), '{}\n', 'utf8'),
    writeFile(join(workDir, 'runtime-snapshot.json.bak'), '{}\n', 'utf8'),
  ])

  await clearStateDir(workDir)

  await expect(readdir(workDir)).resolves.toEqual([])
})

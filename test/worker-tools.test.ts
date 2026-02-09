import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { listWorkerTools, runWorkerTool } from '../src/worker/tools/registry.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-worker-tools-'))

test('worker tools registry exposes expected tools', () => {
  expect(listWorkerTools()).toEqual([
    'read',
    'write',
    'edit',
    'apply_patch',
    'exec',
    'browser',
  ])
})

test('write/read/edit/apply_patch roundtrip', async () => {
  const workDir = await createTmpDir()
  const path = 'notes.txt'

  const writeResult = await runWorkerTool(
    { workDir },
    'write',
    { path, content: 'hello world' },
  )
  expect(writeResult.ok).toBe(true)

  const readResult = await runWorkerTool({ workDir }, 'read', { path })
  expect(readResult.ok).toBe(true)
  expect(readResult.output).toContain('hello world')

  const editResult = await runWorkerTool(
    { workDir },
    'edit',
    { path, oldText: 'world', newText: 'mimikit' },
  )
  expect(editResult.ok).toBe(true)

  const patchResult = await runWorkerTool(
    { workDir },
    'apply_patch',
    {
      patch: [
        '*** Begin Patch',
        '*** Update File: notes.txt',
        '@@',
        '-hello mimikit',
        '+hello worker-standard',
        '*** End Patch',
      ].join('\n'),
    },
  )
  expect(patchResult.ok).toBe(true)

  const file = await readFile(join(workDir, path), 'utf8')
  expect(file).toContain('hello worker-standard')
})

test('exec tool supports command alias and workdir', async () => {
  const workDir = await createTmpDir()
  const result = await runWorkerTool(
    { workDir },
    'exec',
    { cmd: ['echo alpha', 'echo beta'], silent: true },
  )
  expect(result.ok).toBe(true)
  expect(result.output).toContain('alpha')
  expect(result.output).toContain('beta')
})

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/prompts/build-prompts.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))

test('buildWorkerPrompt injects task prompt via {prompt}', async () => {
  const workDir = await createTmpDir()
  const workerDir = join(workDir, 'prompts', 'agents', 'worker-standard')
  await mkdir(workerDir, { recursive: true })
  await writeFile(join(workerDir, 'system.md'), 'SYS', 'utf8')
  await writeFile(join(workerDir, 'injection.md'), 'Task:\n{prompt}\n', 'utf8')

  const output = await buildWorkerPrompt({
    workDir,
    task: {
      id: 'task-1',
      fingerprint: 'fp-1',
      prompt: 'Run health check',
      title: 'Health check',
      profile: 'standard',
      status: 'pending',
      createdAt: '2026-02-06T00:00:00.000Z',
    },
  })

  expect(output).toContain('SYS')
  expect(output).toContain('Task:\nRun health check')
  expect(output).not.toContain('{prompt}')
})


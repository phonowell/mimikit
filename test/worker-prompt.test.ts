import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/prompts/build-prompts.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))

test('buildWorkerPrompt injects prompt and optional context placeholders', async () => {
  const workDir = await createTmpDir()
  const workerDir = join(workDir, 'prompts', 'worker-standard')
  await mkdir(workerDir, { recursive: true })
  await writeFile(join(workerDir, 'system.md'), 'SYS', 'utf8')
  await writeFile(
    join(workerDir, 'injection.md'),
    'Task:\n{prompt}\nCP:\n{checkpoint_recovered}\nA:\n{available_actions}\nT:\n{transcript}\n',
    'utf8',
  )

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
    context: {
      checkpointRecovered: true,
      actions: ['read_file', 'edit_file'],
      transcript: ['action: read_file'],
    },
  })

  expect(output).toContain('SYS')
  expect(output).toContain('Task:\n<MIMIKIT:prompt>\nRun health check\n</MIMIKIT:prompt>')
  expect(output).toContain(
    'CP:\n<MIMIKIT:checkpoint_recovered>\ntrue\n</MIMIKIT:checkpoint_recovered>',
  )
  expect(output).toContain(
    'A:\n<MIMIKIT:available_actions>\nread_file, edit_file\n</MIMIKIT:available_actions>',
  )
  expect(output).toContain(
    'T:\n<MIMIKIT:transcript>\naction: read_file\n</MIMIKIT:transcript>',
  )
  expect(output).not.toContain('{prompt}')
  expect(output).not.toContain('{checkpoint_recovered}')
  expect(output).not.toContain('{available_actions}')
  expect(output).not.toContain('{transcript}')
})

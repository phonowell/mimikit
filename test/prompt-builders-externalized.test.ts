import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/prompts/build-prompts.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-prompt-builders-'))

test('buildWorkerPrompt renders external templates for standard worker', async () => {
  const workDir = await createTmpDir()
  const dir = join(workDir, 'prompts', 'worker-standard')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'system.md'), 'WORKER_SYS', 'utf8')
  await writeFile(
    join(dir, 'injection.md'),
    'cp={checkpoint_recovered}\n{prompt}\n{available_actions}\n{transcript}',
    'utf8',
  )

  const output = await buildWorkerPrompt({
    workDir,
    task: {
      id: 'task-1',
      fingerprint: 'fp-1',
      prompt: 'fix bug',
      title: 'Fix bug',
      profile: 'standard',
      status: 'pending',
      createdAt: '2026-02-06T00:00:00.000Z',
    },
    context: {
      checkpointRecovered: true,
      transcript: ['action: read_file'],
      actions: ['read_file', 'edit_file'],
    },
  })

  expect(output).toContain('WORKER_SYS')
  expect(output).toContain(
    'cp=<MIMIKIT:checkpoint_recovered>\ntrue\n</MIMIKIT:checkpoint_recovered>',
  )
  expect(output).toContain('<MIMIKIT:prompt>\nfix bug\n</MIMIKIT:prompt>')
  expect(output).toContain(
    '<MIMIKIT:available_actions>\nread_file, edit_file\n</MIMIKIT:available_actions>',
  )
  expect(output).toContain(
    '<MIMIKIT:transcript>\naction: read_file\n</MIMIKIT:transcript>',
  )
})

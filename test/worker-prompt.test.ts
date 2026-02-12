import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/prompts/build-prompts.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))
const getTagContent = (output: string, tag: string): string => {
  const match = output.match(
    new RegExp(`<MIMIKIT:${tag}>\\n([\\s\\S]*?)\\n</MIMIKIT:${tag}>`),
  )
  return match?.[1] ?? ''
}

test('buildWorkerPrompt injects task prompt and environment', async () => {
  const workDir = await createTmpDir()

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

  const environment = getTagContent(output, 'environment')
  expect(output).toContain('<MIMIKIT:environment>')
  expect(output).toContain('<MIMIKIT:prompt>\nRun health check\n</MIMIKIT:prompt>')
  expect(environment).toContain(`- work_dir: ${workDir}`)
  expect(environment).toContain('- now_iso:')
  expect(output).not.toContain('{prompt}')
  expect(output).not.toContain('{environment}')
})

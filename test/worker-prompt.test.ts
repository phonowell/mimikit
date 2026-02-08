import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/prompts/build-prompts.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))

test('buildWorkerPrompt injects task prompt via {prompt}', async () => {
  const workDir = await createTmpDir()
  const workerDir = join(workDir, 'prompts', 'agents', 'worker-economy')
  await mkdir(workerDir, { recursive: true })
  await writeFile(join(workerDir, 'system.md'), 'SYS', 'utf8')
  await writeFile(join(workerDir, 'injection.md'), '// 任务描述：\n{prompt}\n', 'utf8')

  const output = await buildWorkerPrompt({
    workDir,
    task: {
      id: 'task-1',
      fingerprint: 'fp-1',
      prompt: '执行健康检查',
      title: '健康检查',
      profile: 'economy',
      status: 'pending',
      createdAt: '2026-02-06T00:00:00.000Z',
    },
  })

  expect(output).toContain('SYS')
  expect(output).toContain('// 任务描述：\n执行健康检查')
  expect(output).not.toContain('{prompt}')
})


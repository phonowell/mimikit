import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/prompts/build-prompts.js'
import { formatEnvironment } from '../src/prompts/format.js'

test('formatEnvironment exposes generated_dir derived from work_dir', () => {
  const workDir = resolve('/tmp/mimikit/.mimikit')
  const output = formatEnvironment({ workDir })

  expect(output).toContain(`- work_dir: ${workDir}`)
  expect(output).toContain(`- generated_dir: ${resolve(workDir, 'generated')}`)
})

test('formatEnvironment omits work_dir and generated_dir when work_dir is missing', () => {
  const output = formatEnvironment()

  expect(output).not.toContain('work_dir:')
  expect(output).not.toContain('generated_dir:')
})

test('buildWorkerPrompt includes absolute generated_dir guidance', async () => {
  const workDir = resolve('/tmp/mimikit/.mimikit')
  const prompt = await buildWorkerPrompt({
    workDir,
    task: {
      id: 'task-prompt-generated-dir',
      prompt: '检查输出目录约束',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  })

  expect(prompt).toContain(`- generated_dir: ${resolve(workDir, 'generated')}`)
  expect(prompt).toContain('不得把默认产物写到相对 `./generated`')
})

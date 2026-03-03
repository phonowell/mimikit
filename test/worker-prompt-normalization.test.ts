import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, test } from 'vitest'

import {
  WORKER_TASK_PROMPT_INLINE_MAX_BYTES,
  normalizeWorkerTaskPrompt,
} from '../src/prompts/build-worker-task-prompt.js'
import {
  buildWorkerPrompt,
} from '../src/prompts/build-prompts.js'

test('normalizeWorkerTaskPrompt extracts wrapped M:prompt content', () => {
  const raw = [
    '## 约束',
    '随便的外层说明',
    '<M:prompt>',
    '仅保留这段任务描述',
    '</M:prompt>',
    '<M:environment>',
    '- work_dir: /tmp/demo',
    '</M:environment>',
  ].join('\n')

  const normalized = normalizeWorkerTaskPrompt(raw)

  expect(normalized).toBe('仅保留这段任务描述')
})

test('normalizeWorkerTaskPrompt removes inline environment and extra blank lines', () => {
  const raw = ['任务A', '', '', '', '<M:environment>', '- k: v', '</M:environment>'].join(
    '\n',
  )
  const normalized = normalizeWorkerTaskPrompt(raw)
  expect(normalized).toBe('任务A')
})

test('buildWorkerPrompt externalizes oversized task prompt into generated dir', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))
  const workDir = resolve(root, '.mimikit')
  const prompt = `task: ${'detail '.repeat(260)}`

  const rendered = await buildWorkerPrompt({
    workDir,
    task: {
      id: 'task-worker-prompt-externalize',
      prompt,
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  })

  expect(Buffer.byteLength(prompt, 'utf8')).toBeGreaterThan(
    WORKER_TASK_PROMPT_INLINE_MAX_BYTES,
  )
  expect(rendered).toContain('任务说明已按需外置以减少每步上下文体积。')
  expect(rendered).toContain('full_prompt_path:')

  const pathLine = rendered
    .split('\n')
    .find((line) => line.startsWith('full_prompt_path:'))
  expect(pathLine).toBeTruthy()
  if (!pathLine) throw new Error('missing full_prompt_path line')
  const fullPath = pathLine.slice('full_prompt_path:'.length).trim()

  const saved = await readFile(fullPath, 'utf8')
  expect(saved).toBe(normalizeWorkerTaskPrompt(prompt))
  expect(fullPath).toContain('/generated/worker-task-prompts/task-worker-prompt-externalize.md')
})

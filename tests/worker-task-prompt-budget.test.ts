import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  normalizeWorkerTaskPrompt,
  prepareWorkerTaskPrompt,
  WORKER_TASK_PROMPT_INLINE_MAX_BYTES,
} from '../src/execution/prompts/build-worker-task-prompt.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('prepareWorkerTaskPrompt keeps tiny prompts inline', async () => {
  const workDir = await createTmpDir()
  const prompt = 'a'.repeat(WORKER_TASK_PROMPT_INLINE_MAX_BYTES)

  const result = await prepareWorkerTaskPrompt({
    workDir,
    taskId: 'task-inline',
    taskCreatedAt: '2026-03-23T00:00:00.000Z',
    taskPrompt: prompt,
  })

  expect(result).toBe(prompt)
  await expect(
    access(
      join(workDir, 'generated/worker-task-prompts/2026-03-23/task-inline.md'),
    ),
  ).rejects.toBeDefined()
})

test('prepareWorkerTaskPrompt externalizes prompts above the inline threshold', async () => {
  const workDir = await createTmpDir()
  const prompt = 'b'.repeat(WORKER_TASK_PROMPT_INLINE_MAX_BYTES + 1)

  const result = await prepareWorkerTaskPrompt({
    workDir,
    taskId: 'task-externalized',
    taskCreatedAt: '2026-03-23T00:00:00.000Z',
    taskPrompt: prompt,
  })

  const promptPath = join(
    workDir,
    'generated/worker-task-prompts/2026-03-23/task-externalized.md',
  )

  expect(result).toContain('full_prompt_path:')
  expect(result).toContain(promptPath)
  expect(await readFile(promptPath, 'utf8')).toBe(prompt)
})

test('normalizeWorkerTaskPrompt extracts wrapped prompt even without environment block', () => {
  expect(
    normalizeWorkerTaskPrompt('<M:prompt>\n只执行当前任务正文。\n</M:prompt>'),
  ).toBe('只执行当前任务正文。')
})

test('normalizeWorkerTaskPrompt drops environment wrapper without requiring prompt wrapper', () => {
  expect(
    normalizeWorkerTaskPrompt(
      [
        '<M:environment>',
        'cwd: /repo/mimikit',
        '</M:environment>',
        '',
        '直接执行当前任务正文。',
      ].join('\n'),
    ),
  ).toBe('直接执行当前任务正文。')
})

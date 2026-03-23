import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  prepareWorkerTaskPrompt,
  WORKER_TASK_PROMPT_INLINE_MAX_BYTES,
} from '../src/prompts/build-worker-task-prompt.js'

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
      join(
        workDir,
        'generated/worker-task-prompts/2026-03-23/task-inline.md',
      ),
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

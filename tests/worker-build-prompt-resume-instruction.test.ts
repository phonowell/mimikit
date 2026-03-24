import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/execution/prompts/build-worker-prompt.js'

import type { Task } from '../src/foundation/types/index.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))
  tempDirs.push(dir)
  return dir
}

const createTask = (id: string): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: '修复当前测试失败。',
  title: '修复测试',
  cwd: '/tmp/worker-prompt',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-06T00:00:00.000Z',
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('buildWorkerPrompt includes resume instruction block when provided', async () => {
  const stateDir = await createTmpDir()
  const prompt = await buildWorkerPrompt({
    stateDir,
    workspaceDir: '/repo/mimikit',
    task: createTask('task-build-worker-prompt'),
    resumeInstruction: '继续当前任务，但先确认工作区已有改动是否需要保留。',
  })

  expect(prompt).toContain('<M:resume_instruction>')
  expect(prompt).toContain('继续当前任务，但先确认工作区已有改动是否需要保留。')
})

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/execution/prompts/build-worker-prompt.js'
import { persistTaskExecutionSpec } from '../src/work/spec/store.js'

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
  semanticKey: `sk-${id}`,
  executionSpecId: `spec-${id}`,
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
  await persistTaskExecutionSpec({
    stateDir,
    prompt: '修复当前测试失败。',
    specId: 'spec-task-build-worker-prompt',
  })
  const prompt = await buildWorkerPrompt({
    stateDir,
    workspaceDir: '/repo/mimikit',
    task: createTask('task-build-worker-prompt'),
    resumeInstruction: '继续当前任务，但先确认工作区已有改动是否需要保留。',
  })

  expect(prompt).toContain('<M:resume_instruction>')
  expect(prompt).toContain('继续当前任务，但先确认工作区已有改动是否需要保留。')
})

test('buildWorkerPrompt prioritizes task contract and protocol over emotional pressure', async () => {
  const stateDir = await createTmpDir()
  await persistTaskExecutionSpec({
    stateDir,
    prompt: '修复当前测试失败。',
    specId: 'spec-task-build-worker-prompt-priority',
  })
  const prompt = await buildWorkerPrompt({
    stateDir,
    workspaceDir: '/repo/mimikit',
    task: createTask('task-build-worker-prompt-priority'),
    focusBrief: {
      focusId: 'focus-inbox',
      title: 'focus-inbox',
      summary: '之前的任务已完成。',
      updatedAt: '2026-03-06T00:00:00.000Z',
      lastActivityAt: '2026-03-06T00:00:00.000Z',
    },
    resumeInstruction: '继续当前任务，但先核对工作区已有改动。',
  })

  expect(prompt).toContain('先读取该文件再执行')
  expect(prompt).toContain('以任务合同、工作区现状与可验证证据为准')
  expect(prompt).toContain('`focus_brief` 仅作背景摘要')
  expect(prompt).toContain('`resume_instruction` 只影响本次恢复策略')
  expect(prompt).not.toContain('currently undergoing chemotherapy')
  expect(prompt).not.toContain('You are a lifeline')
  expect(prompt).not.toContain('top 0.1% of engineers')
})

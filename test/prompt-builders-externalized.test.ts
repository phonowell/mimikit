import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  buildCodeEvolveTaskPrompt,
  buildIdleReviewPrompt,
  buildPromptOptimizerPrompt,
  buildWorkerStandardPlannerPrompt,
} from '../src/prompts/build-prompts.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-prompt-builders-'))

test('buildWorkerStandardPlannerPrompt renders external templates', async () => {
  const workDir = await createTmpDir()
  const dir = join(workDir, 'prompts', 'agents', 'worker-standard')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'planner-system.md'), 'PLANNER_SYS', 'utf8')
  await writeFile(
    join(dir, 'planner-injection.md'),
    'cp={checkpoint_recovered}\n{task_prompt}\n{available_actions}\n{transcript}',
    'utf8',
  )

  const output = await buildWorkerStandardPlannerPrompt({
    workDir,
    taskPrompt: 'fix bug',
    transcript: ['action: read_file_file'],
    actions: ['read_file', 'edit_file'],
    checkpointRecovered: true,
  })

  expect(output).toContain('PLANNER_SYS')
  expect(output).toContain('cp=true')
  expect(output).toContain('fix bug')
  expect(output).toContain('read_file, edit_file')
  expect(output).toContain('action: read_file')
})

test('buildIdleReviewPrompt renders external templates', async () => {
  const workDir = await createTmpDir()
  const dir = join(workDir, 'prompts', 'agents', 'thinker')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'idle-review-system.md'), 'IDLE_SYS', 'utf8')
  await writeFile(
    join(dir, 'idle-review-injection.md'),
    'snippets:\n{history_snippets}',
    'utf8',
  )

  const output = await buildIdleReviewPrompt({
    workDir,
    historyTexts: ['user: hi', 'assistant: ok'],
  })

  expect(output).toContain('IDLE_SYS')
  expect(output).toContain('1. user: hi')
  expect(output).toContain('2. assistant: ok')
})

test('buildCodeEvolveTaskPrompt and optimizer prompt use templates', async () => {
  const workDir = await createTmpDir()
  const expertDir = join(workDir, 'prompts', 'agents', 'worker-expert')
  const thinkerDir = join(workDir, 'prompts', 'agents', 'thinker')
  await mkdir(expertDir, { recursive: true })
  await mkdir(thinkerDir, { recursive: true })
  await writeFile(
    join(expertDir, 'code-evolve-task.md'),
    'feedback:\n{feedback_list}',
    'utf8',
  )
  await writeFile(
    join(thinkerDir, 'prompt-optimizer.md'),
    'source:\n{source_prompt}',
    'utf8',
  )

  const evolvePrompt = await buildCodeEvolveTaskPrompt({
    workDir,
    feedbackMessages: ['latency high', 'error spikes'],
  })
  const optimizerPrompt = await buildPromptOptimizerPrompt({
    workDir,
    source: 'old prompt text',
  })

  expect(evolvePrompt).toContain('1. latency high')
  expect(evolvePrompt).toContain('2. error spikes')
  expect(optimizerPrompt).toContain('old prompt text')
})


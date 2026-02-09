import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildWorkerStandardPlannerPrompt } from '../src/prompts/build-prompts.js'

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

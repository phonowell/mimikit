import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildManagerPrompt } from '../src/prompts/build-prompts.js'
import type { PromptSectionLimits } from '../src/config.js'

const promptSectionLimits: PromptSectionLimits = {
  actionFeedbackMaxBytes: 8192,
  batchResultsMaxBytes: 20480,
  compressedContextMaxBytes: 12288,
  environmentMaxBytes: 4096,
  fileLookupMaxBytes: 20480,
  focusContextsMaxBytes: 20480,
  focusListMaxBytes: 8192,
  historyLookupMaxBytes: 20480,
  inputsMaxBytes: 8192,
  memoryMaxBytes: 8192,
  plansMaxBytes: 16384,
  recentHistoryMaxBytes: 8192,
  taskArchiveLookupMaxBytes: 20480,
  tasksMaxBytes: 24576,
}

test('buildManagerPrompt renders task archive lookup section', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-task-archive-'))
  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [],
    results: [],
    tasks: [],
    promptSectionLimits,
    taskArchiveLookup: [
      {
        taskId: 'task-lookup-1',
        status: 'succeeded',
        completedAt: '2026-03-05T00:00:00.000Z',
        archivePath: join(stateDir, 'tasks/2026-03-05/task-lookup-1.md'),
        score: 1.23,
        title: 'Lookup Hit',
        snippet: 'Matched archive content',
      },
    ],
  })

  expect(prompt).toContain('<M:task_archive_lookup>')
  expect(prompt).toContain('task-lookup-1')
  expect(prompt).toContain('Matched archive content')
})

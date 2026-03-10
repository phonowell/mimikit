import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { writeMemoryEntries } from '../src/memory/store.js'
import {
  buildManagerPrompt,
  type PromptSectionLimits,
} from '../src/prompts/build-prompts.js'

const promptSectionLimits = (
  memoryMaxBytes: number,
): PromptSectionLimits => ({
  environmentMaxBytes: 1024,
  inputsMaxBytes: 1024,
  batchResultsMaxBytes: 1024,
  tasksMaxBytes: 1024,
  plansMaxBytes: 1024,
  recentHistoryMaxBytes: 1024,
  focusListMaxBytes: 1024,
  focusContextsMaxBytes: 1024,
  historyLookupMaxBytes: 1024,
  queryLookupMaxBytes: 1024,
  fileLookupMaxBytes: 1024,
  actionFeedbackMaxBytes: 1024,
  packetSummaryMaxBytes: 1024,
  memoryMaxBytes,
})

test('buildManagerPrompt ranks memory by relevance under memory budget', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-memory-'))
  await writeMemoryEntries(join(stateDir, 'memory', 'MEMORY.md'), [
    {
      id: 'memory-irrelevant',
      title: 'Tooling preference',
      content: 'Prefer jest for snapshot updates.',
      updatedAt: '2026-03-06T00:00:00.000Z',
      source: 'remember',
    },
    {
      id: 'memory-chinese',
      title: 'Language preference',
      content: 'Use Chinese concise responses.',
      updatedAt: '2026-01-01T00:00:00.000Z',
      source: 'remember',
    },
  ])

  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: 'Please keep Chinese concise style.',
        createdAt: '2026-03-06T00:00:00.000Z',
        focusId: 'focus-global',
      },
      {
        id: 'input-2',
        role: 'user',
        text: 'Repeat: Chinese concise.',
        createdAt: '2026-03-06T00:01:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits: promptSectionLimits(90),
  })

  expect(prompt).toContain('id:memory-chinese')
  expect(prompt).not.toContain('id:memory-irrelevant')
})

test('buildManagerPrompt keeps remembered rules in dedicated stable context', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-remembered-'))
  await writeMemoryEntries(join(stateDir, 'memory', 'MEMORY.md'), [
    {
      id: 'memory-rule',
      title: 'Reply style',
      content: 'Always answer in concise Chinese.',
      updatedAt: '2026-03-06T00:00:00.000Z',
      source: 'remember',
    },
    {
      id: 'memory-debug',
      title: 'Build issue',
      content: 'The failing module is packages/server/runtime.ts.',
      updatedAt: '2026-03-06T00:01:00.000Z',
      source: 'refresh',
    },
  ])

  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: 'Check why runtime.ts fails to compile.',
        createdAt: '2026-03-06T00:02:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits: promptSectionLimits(120),
  })

  expect(prompt).toContain('<M:remembered_memory>')
  expect(prompt).toContain('id:memory-rule')
})

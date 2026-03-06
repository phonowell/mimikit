import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { writeMemoryEntries } from '../src/memory/store.js'
import { buildManagerPrompt } from '../src/prompts/build-prompts.js'

test('buildManagerPrompt ranks memory by relevance under memory budget', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-memory-'))
  const config = defaultConfig({ workDir: stateDir })
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
    promptSectionLimits: {
      ...config.manager.promptSections,
      memoryMaxBytes: 90,
    },
  })

  expect(prompt).toContain('id:memory-chinese')
  expect(prompt).not.toContain('id:memory-irrelevant')
})

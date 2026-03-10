import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildManagerPrompt } from '../src/prompts/build-prompts.js'
import type { PromptSectionLimits } from '../src/config.js'

const promptSectionLimits: PromptSectionLimits = {
  actionFeedbackMaxBytes: 8192,
  batchResultsMaxBytes: 20480,
  environmentMaxBytes: 4096,
  fileLookupMaxBytes: 20480,
  focusContextsMaxBytes: 20480,
  focusListMaxBytes: 8192,
  historyLookupMaxBytes: 20480,
  inputsMaxBytes: 8192,
  memoryMaxBytes: 8192,
  packetSummaryMaxBytes: 6144,
  plansMaxBytes: 16384,
  queryLookupMaxBytes: 20480,
  recentHistoryMaxBytes: 8192,
  tasksMaxBytes: 24576,
}

test('buildManagerPrompt renders query lookup section', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-query-lookup-'))
  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [],
    results: [],
    tasks: [],
    promptSectionLimits,
    queryLookup: {
      request: {
        query: 'deploy',
      },
      results: {
        tasks: {
          items: [
            {
              ref: 'task:task-1',
              id: 'task-1',
              status: 'running',
              focusId: 'focus-release',
              createdAt: '2026-03-06T00:00:00.000Z',
              score: 0.91,
              title: 'Deploy API',
              snippet: 'deploy snippet',
            },
          ],
          truncated: false,
        },
        generated_index: {
          items: [
            {
              ref: 'generated:generated/deploy-notes.md',
              path: 'generated/deploy-notes.md',
              updatedAt: '2026-03-06T00:10:00.000Z',
              size: 48,
              score: 0.77,
              snippet: 'deploy service alpha with canary strategy',
            },
          ],
          truncated: false,
        },
      },
      meta: {
        truncated: false,
        usedBytes: 320,
        maxBytes: 12288,
      },
    },
  })

  expect(prompt).toContain('<M:event_packet>')
  expect(prompt).toContain('task:task-1')
  expect(prompt).toContain('"query": "deploy"')
  expect(prompt).not.toContain('"scopes"')
})

import { expect, test } from 'vitest'

import { appendHistory } from '../src/history/store.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('buildManagerPromptPayload tolerates CDATA-sensitive text in digest sections', async () => {
  const runtime = await createTestRuntimeState()
  const noisyText = 'release-note ]]> '.repeat(40).trim()

  await appendHistory(runtime.paths.history, {
    id: 'history-cdata-1',
    role: 'user',
    text: noisyText,
    createdAt: '2026-03-10T00:01:01.000Z',
    focusId: 'focus-global',
  })

  const payload = await buildManagerPromptPayload({
    stateDir: runtime.config.workDir,
    workDir: runtime.config.workDir,
    inputs: [
      {
        id: 'input-cdata-1',
        role: 'user',
        text: noisyText,
        createdAt: '2026-03-10T00:01:02.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [
      {
        taskId: 'task-cdata-1',
        status: 'succeeded',
        ok: true,
        output: noisyText,
        durationMs: 1,
        completedAt: '2026-03-10T00:01:03.000Z',
      },
    ],
    tasks: [
      {
        id: 'task-cdata-1',
        fingerprint: 'task-cdata-1',
        prompt: noisyText,
        title: 'Digest CDATA text',
        cwd: runtime.config.workDir,
        profile: 'worker',
        provider: 'codex',
        status: 'succeeded',
        focusId: 'focus-global',
        createdAt: '2026-03-10T00:01:00.000Z',
        completedAt: '2026-03-10T00:01:03.000Z',
      },
    ],
    promptSectionLimits: runtime.config.manager.promptSections,
    workingFocusIds: ['focus-global'],
    queryLookup: {
      request: { query: noisyText },
      results: {
        history: {
          truncated: false,
          items: [
            {
              ref: 'history:history-cdata-1',
              id: 'history-cdata-1',
              role: 'user',
              time: '2026-03-10T00:01:01.000Z',
              score: 0.9,
              focusId: 'focus-global',
              snippet: noisyText,
            },
          ],
        },
      },
      meta: {
        truncated: false,
        usedBytes: 256,
        maxBytes: 2048,
      },
    },
    packetMode: 'expanded',
    wakeProfile: 'mixed',
  })

  expect(payload.suffix).toContain('<M:event_packet>')
  expect(payload.contextPacket.sectionDigests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ section: 'query_lookup', mode: 'digest' }),
      expect.objectContaining({ section: 'batch_results', mode: 'digest' }),
    ]),
  )
})

import { expect, test } from 'vitest'

import { appendHistory } from '../src/history/store.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type {
  QueryLookupMessage,
  Task,
  TaskResult,
  UserInput,
} from '../src/types/index.js'

const extractEventPacket = (prompt: string): Record<string, unknown> => {
  const match = prompt.match(/<M:event_packet>\n([\s\S]*?)\n<\/M:event_packet>/)
  if (!match?.[1]) throw new Error('missing event packet')
  return JSON.parse(match[1]) as Record<string, unknown>
}

test('buildManagerPromptPayload keeps original sections when digest would grow bytes', async () => {
  const runtime = await createTestRuntimeState()
  await appendHistory(runtime.paths.history, {
    id: 'history-short-1',
    role: 'user',
    text: 'ok',
    createdAt: '2026-03-10T00:00:01.000Z',
    focusId: 'focus-global',
  })

  const tasks: Task[] = [
    {
      id: 'task-short-1',
      fingerprint: 'task-short-1',
      prompt: 'ok',
      title: 'Short Task',
      cwd: runtime.config.workDir,
      profile: 'worker',
      provider: 'codex',
      status: 'running',
      focusId: 'focus-global',
      createdAt: '2026-03-10T00:00:00.000Z',
    },
  ]
  const results: TaskResult[] = [
    {
      taskId: 'task-short-1',
      status: 'succeeded',
      ok: true,
      output: 'ok',
      durationMs: 12,
      completedAt: '2026-03-10T00:00:10.000Z',
    },
  ]
  const queryLookup: QueryLookupMessage = {
    request: { query: 'short' },
    results: {
      history: {
        truncated: false,
        items: [
          {
            ref: 'history:history-short-1',
            id: 'history-short-1',
            role: 'user',
            time: '2026-03-10T00:00:01.000Z',
            score: 0.9,
            focusId: 'focus-global',
            snippet: 'ok',
          },
        ],
      },
    },
    meta: {
      truncated: false,
      usedBytes: 64,
      maxBytes: 256,
    },
  }
  const inputs: UserInput[] = [
    {
      id: 'input-short-1',
      role: 'user',
      text: '继续',
      createdAt: '2026-03-10T00:00:12.000Z',
      focusId: 'focus-global',
    },
  ]

  const payload = await buildManagerPromptPayload({
    stateDir: runtime.config.workDir,
    workDir: runtime.config.workDir,
    inputs,
    results,
    tasks,
    promptSectionLimits: runtime.config.manager.promptSections,
    workingFocusIds: ['focus-global'],
    queryLookup,
    packetMode: 'expanded',
    wakeProfile: 'mixed',
  })

  const eventPacket = extractEventPacket(payload.suffix)
  const querySection = eventPacket.query_lookup as Record<string, unknown>
  const batchSection = eventPacket.batch_results as Record<string, unknown>
  const historySection = eventPacket.recent_history as Record<string, unknown>

  expect(querySection.mode).toBeUndefined()
  expect((querySection.request as Record<string, unknown>).query).toBe('short')
  expect(batchSection.tasks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'task-short-1',
      }),
    ]),
  )
  expect(historySection.summary).toEqual(
    expect.objectContaining({
      recent_count: 1,
      sampled_count: 1,
    }),
  )
  expect(payload.contextPacket.sectionDigests).toBeUndefined()
})

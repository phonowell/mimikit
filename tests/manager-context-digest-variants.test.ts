import { expect, test } from 'vitest'
import { appendHistory } from '../src/history/store.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'
import type { QueryLookupMessage, Task, TaskResult, UserInput } from '../src/types/index.js'
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

  const eventPacket = payload.suffix.match(
    /<M:event_packet>\n([\s\S]*?)\n<\/M:event_packet>/,
  )
  expect(eventPacket?.[1]).toBeTruthy()
  const parsed = JSON.parse(eventPacket?.[1] ?? '{}') as Record<string, unknown>
  const querySection = parsed.query_lookup as Record<string, unknown>
  const batchSection = parsed.batch_results as Record<string, unknown>
  const historySection = parsed.recent_history as Record<string, unknown>

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

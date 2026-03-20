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

const LONG_TEXT = 'release-note '.repeat(80).trim()

const extractEventPacket = (prompt: string): Record<string, unknown> => {
  const match = prompt.match(/<M:event_packet>\n([\s\S]*?)\n<\/M:event_packet>/)
  if (!match?.[1]) throw new Error('missing event packet')
  return JSON.parse(match[1]) as Record<string, unknown>
}

test('buildManagerPromptPayload injects digests for noisy context sections', async () => {
  const runtime = await createTestRuntimeState()
  await appendHistory(runtime.paths.history, {
    id: 'history-1',
    role: 'user',
    text: LONG_TEXT,
    createdAt: '2026-03-10T00:00:01.000Z',
    focusId: 'focus-global',
  })
  await appendHistory(runtime.paths.history, {
    id: 'history-2',
    role: 'agent',
    text: LONG_TEXT,
    createdAt: '2026-03-10T00:00:02.000Z',
    focusId: 'focus-global',
  })
  await appendHistory(runtime.paths.history, {
    id: 'history-3',
    role: 'system',
    visibility: 'all',
    text: LONG_TEXT,
    createdAt: '2026-03-10T00:00:03.000Z',
    focusId: 'focus-global',
  })

  const tasks: Task[] = [
    {
      id: 'task-release-1',
      fingerprint: 'task-release-1',
      prompt: LONG_TEXT,
      title: 'Summarize Release Notes',
      cwd: runtime.config.workDir,
      profile: 'worker',
      provider: 'codex',
      status: 'running',
      focusId: 'focus-global',
      createdAt: '2026-03-10T00:00:00.000Z',
      archivePath: `${runtime.config.workDir}/archives/task-release-1.md`,
    },
  ]
  const results: TaskResult[] = [
    {
      taskId: 'task-release-1',
      status: 'succeeded',
      ok: true,
      output: LONG_TEXT,
      durationMs: 12,
      completedAt: '2026-03-10T00:00:10.000Z',
      archivePath: `${runtime.config.workDir}/archives/task-release-1.md`,
      handoff: {
        summary: LONG_TEXT,
      },
    },
  ]
  const queryLookup: QueryLookupMessage = {
    request: { query: 'release notes follow-up' },
    results: {
      history: {
        truncated: false,
        items: [
          {
            ref: 'history:history-1',
            id: 'history-1',
            role: 'user',
            time: '2026-03-10T00:00:01.000Z',
            score: 0.9,
            focusId: 'focus-global',
            snippet: LONG_TEXT,
          },
          {
            ref: 'history:history-2',
            id: 'history-2',
            role: 'agent',
            time: '2026-03-10T00:00:02.000Z',
            score: 0.8,
            focusId: 'focus-global',
            snippet: LONG_TEXT,
          },
        ],
      },
      task_archives: {
        truncated: false,
        items: [
          {
            ref: 'archive:task-release-1',
            taskId: 'task-release-1',
            status: 'succeeded',
            completedAt: '2026-03-10T00:00:10.000Z',
            archivePath: `${runtime.config.workDir}/archives/task-release-1.md`,
            score: 0.95,
            title: 'Summarize Release Notes',
            snippet: LONG_TEXT,
          },
        ],
      },
    },
    meta: {
      truncated: false,
      usedBytes: 4096,
      maxBytes: 8192,
    },
  }
  const inputs: UserInput[] = [
    {
      id: 'input-release-1',
      role: 'user',
      text: '继续整理发布说明',
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
  const queryDigest = eventPacket.query_lookup as Record<string, unknown>
  const batchDigest = eventPacket.batch_results as Record<string, unknown>
  const historyDigest = eventPacket.recent_history as Record<string, unknown>

  expect(queryDigest.mode).toBe('digest')
  expect(batchDigest.mode).toBe('digest')
  expect(historyDigest.mode).toBe('digest')
  expect(queryDigest.source_refs).toEqual(
    expect.arrayContaining(['history:history-1', 'archive:task-release-1']),
  )
  expect(batchDigest.source_refs).toEqual(
    expect.arrayContaining([
      `${runtime.config.workDir}/archives/task-release-1.md`,
    ]),
  )
  expect(payload.contextPacket.sectionDigests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        section: 'query_lookup',
        mode: 'digest',
      }),
      expect.objectContaining({
        section: 'batch_results',
        mode: 'digest',
      }),
      expect.objectContaining({
        section: 'recent_history',
        mode: 'digest',
      }),
    ]),
  )

  const queryStats = payload.contextPacket.sectionDigests?.find(
    (item) => item.section === 'query_lookup',
  )
  const batchStats = payload.contextPacket.sectionDigests?.find(
    (item) => item.section === 'batch_results',
  )

  expect(queryStats?.sourceBytes).toBeGreaterThan(queryStats?.digestBytes ?? 0)
  expect(batchStats?.sourceBytes).toBeGreaterThan(batchStats?.digestBytes ?? 0)
})

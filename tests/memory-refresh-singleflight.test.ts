import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import { rewriteHistory } from '../src/persistence/history/store.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const capturedPayloads: unknown[] = []

vi.mock('../src/policy/memory/refresh/single-call.js', () => ({
  runMemoryRefreshSingleCall: vi.fn((params: { payload: unknown }) => {
    capturedPayloads.push(params.payload)
    return Promise.resolve({
      mode: 'noop',
      reason: 'test',
      entries: [],
      deleteEntryIds: [],
    })
  }),
}))

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-memory-refresh-'))

test('requestMemoryRefresh excludes task outputs and plan titles from payload', async () => {
  capturedPayloads.length = 0
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    patch: {
      manager: {
        turn: 20,
      },
      tasks: [
        {
          id: 'task-1',
          fingerprint: 'task-1',
          prompt: 'do work',
          title: 'Prepare launch checklist',
          cwd: stateDir,
          focusId: 'focus-a',
          profile: 'worker',
          provider: 'codex',
          status: 'failed',
          createdAt: '2026-03-20T00:00:00.000Z',
          result: {
            taskId: 'task-1',
            status: 'failed',
            ok: false,
            output: 'Failure details with rollout notes',
            durationMs: 10,
            completedAt: '2026-03-20T00:00:10.000Z',
          },
        },
      ],
      taskPlans: [
        {
          id: 'plan-1',
          prompt: 'old shape',
          title: 'Nightly backlog sweep',
          focusId: 'focus-a',
          profile: 'worker',
          priority: 'normal',
          source: 'user_request',
          status: 'active',
          trigger: { mode: 'cron', cron: '0 1 * * *' },
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
          runtime: { runCount: 0 },
        },
      ],
      focuses: [
        {
          id: 'focus-global',
          title: 'Global',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
          lastActivityAt: '2026-03-20T00:00:00.000Z',
        },
        {
          id: 'focus-a',
          title: 'Focus A',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
          lastActivityAt: '2026-03-20T00:00:00.000Z',
        },
      ],
    },
  })
  await rewriteHistory(runtime.paths.history, [
    {
      id: 'sys-memory-1',
      role: 'system',
      visibility: 'agent',
      text: 'Memory entry remembered.',
      createdAt: '2026-03-20T00:00:00.000Z',
      focusId: 'focus-a',
      systemEventName: 'memory_remembered',
      systemEventPayload: {
        entry_id: 'memory-release-policy',
        category: 'project',
        ref: 'release-policy',
        operation: 'created',
      },
    },
  ])
  runtime.process.manager.memoryRefresh.signalVersion = 1

  const { requestMemoryRefresh } =
    await import('../src/policy/memory/refresh/singleflight.js')

  requestMemoryRefresh(runtime)

  await expect.poll(() => capturedPayloads[0]).toBeTruthy()
  expect(capturedPayloads[0]).toMatchObject({
    signals: [
      {
        id: 'sys-memory-1',
        role: 'system',
      },
    ],
  })
  expect(JSON.stringify(capturedPayloads[0])).not.toContain(
    'Failure details with rollout notes',
  )
  expect(JSON.stringify(capturedPayloads[0])).not.toContain(
    'Nightly backlog sweep',
  )
  expect(JSON.stringify(capturedPayloads[0])).toContain(
    'entry_id=memory-release-policy',
  )
  expect(JSON.stringify(capturedPayloads[0])).not.toContain(
    'Keep the oncall escalation path stable across release weeks.',
  )
})

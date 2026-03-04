import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { beforeEach, expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { applyTaskActions } from '../src/manager/action-apply.js'
import { proactiveCompressManagerContext } from '../src/manager/action-runtime-compress.js'
import { loadRuntimeSnapshot } from '../src/storage/runtime-snapshot.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const GLOBAL_FOCUS_ID = 'focus-global'

const { runWithProviderMock } = vi.hoisted(() => ({
  runWithProviderMock: vi.fn(),
}))

vi.mock('../src/providers/registry.js', () => ({
  runWithProvider: runWithProviderMock,
}))

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-action-apply-compress-'))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const queue = new PQueue({ concurrency: config.worker.maxConcurrent })
  queue.pause()
  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  return {
    runtimeId: 'runtime-test',
    config,
    paths: buildPaths(workDir),
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    managerWakePending: false,
    lastManagerActivityAtMs: nowMs,
    lastWorkerActivityAtMs: nowMs,
    inflightInputs: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
    tasks: [
      {
        id: 'task-seed',
        fingerprint: 'task-seed',
        prompt: 'seed prompt',
        title: 'seed',
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
        status: 'succeeded',
        createdAt: now,
        completedAt: now,
        result: {
          taskId: 'task-seed',
          status: 'succeeded',
          ok: true,
          output: 'seed output',
          durationMs: 1,
          completedAt: now,
        },
      },
    ],
    taskPlans: [],
    focuses: [
      {
        id: GLOBAL_FOCUS_ID,
        title: 'Global',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
    ],
    focusContexts: [],
    activeFocusIds: [GLOBAL_FOCUS_ID],
    managerTurn: 0,
    memoryRefresh: {
      lastCompletedTurn: 0,
      lastProcessedInputsCursor: 0,
      lastProcessedResultsCursor: 0,
      running: false,
      pending: false,
    },
    managerFocusCompressedContexts: [],
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: null,
  }
}

beforeEach(() => {
  runWithProviderMock.mockReset()
})

test('compress_context stores summary with local context', async () => {
  const runtime = await createRuntime()
  runWithProviderMock.mockResolvedValue({
    output: 'Goals\n- keep codex-only',
    elapsedMs: 10,
  })

  await applyTaskActions(runtime, [
    {
      name: 'compress_context',
      attrs: {},
    },
  ])

  expect(runWithProviderMock).toHaveBeenCalledTimes(1)
  expect(runWithProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'openai-responses',
      role: 'manager',
    }),
  )
  expect(runtime.managerFocusCompressedContexts).toHaveLength(1)
  expect(runtime.managerFocusCompressedContexts[0]).toMatchObject({
    focusId: GLOBAL_FOCUS_ID,
  })
  expect(runtime.managerFocusCompressedContexts[0]?.summary).toContain('Goals')
  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  expect(snapshot.managerFocusCompressedContexts).toHaveLength(1)
  expect(snapshot.managerFocusCompressedContexts?.[0]?.summary).toContain(
    'keep codex-only',
  )
})

test('compress_context throws when summary is empty', async () => {
  const runtime = await createRuntime()
  runWithProviderMock.mockResolvedValue({
    output: '   ',
    elapsedMs: 8,
  })

  await expect(
    applyTaskActions(runtime, [
      {
        name: 'compress_context',
        attrs: {},
      },
    ]),
  ).rejects.toThrow('compress_context_empty_summary')

  expect(runtime.managerFocusCompressedContexts).toHaveLength(0)
})

test('proactive compression targets working focus and skips fresh summary', async () => {
  const runtime = await createRuntime()
  runtime.managerTurn = 1
  runtime.focuses.push({
    id: 'focus-local',
    title: 'Local',
    status: 'active',
    createdAt: '2026-03-03T00:00:00.000Z',
    updatedAt: '2026-03-03T00:00:00.000Z',
    lastActivityAt: '2026-03-03T00:00:01.000Z',
  })
  runtime.tasks.push({
    id: 'task-local',
    fingerprint: 'task-local',
    prompt: 'collect local context',
    title: 'local task',
    focusId: 'focus-local',
    profile: 'worker',
    status: 'succeeded',
    createdAt: '2026-03-03T00:00:00.000Z',
    completedAt: '2026-03-03T00:00:01.000Z',
    result: {
      taskId: 'task-local',
      status: 'succeeded',
      ok: true,
      output: 'local output',
      durationMs: 10,
      completedAt: '2026-03-03T00:00:01.000Z',
    },
  })
  runWithProviderMock.mockResolvedValue({
    output: 'Goals\n- local summary',
    elapsedMs: 9,
  })

  const first = await proactiveCompressManagerContext(runtime, ['focus-local'])
  expect(first).toEqual(['focus-local'])
  expect(runtime.managerFocusCompressedContexts[0]?.focusId).toBe('focus-local')
  expect(runWithProviderMock).toHaveBeenCalledTimes(1)

  runWithProviderMock.mockReset()
  const second = await proactiveCompressManagerContext(runtime, ['focus-local'])
  expect(second).toEqual([])
  expect(runWithProviderMock).not.toHaveBeenCalled()
})

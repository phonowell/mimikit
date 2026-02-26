import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { beforeEach, expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { applyTaskActions } from '../src/manager/action-apply.js'
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
    tasks: [],
    cronJobs: [],
    idleIntents: [],
    idleIntentArchive: [],
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
    uiStream: null,
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakePending: false,
    uiWakeKind: null,
    uiSignalController: new AbortController(),
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
      provider: 'openai-chat',
      role: 'manager',
    }),
  )
  expect(runtime.managerCompressedContext).toContain('Goals')
  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  expect(snapshot.managerCompressedContext).toContain('keep codex-only')
})

test('compress_context runs even when there is no session thread', async () => {
  const runtime = await createRuntime()
  runWithProviderMock.mockResolvedValue({
    output: 'Goals\n- local only',
    elapsedMs: 7,
  })

  await applyTaskActions(runtime, [
    {
      name: 'compress_context',
      attrs: {},
    },
  ])

  expect(runWithProviderMock).toHaveBeenCalledTimes(1)
  expect(runtime.managerCompressedContext).toContain('local only')
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

  expect(runtime.managerCompressedContext).toBeUndefined()
})

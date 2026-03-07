import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { requestMemoryRefresh } from '../src/memory/refresh/singleflight.js'
import { writeMemoryEntries } from '../src/memory/store.js'
import { createDefaultMemoryRefreshState } from '../src/memory/refresh/state.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { MemoryRefreshSubprocessResult } from '../src/memory/refresh/types.js'

const {
  spawnMemoryRefreshJobMock,
  appendLogMock,
  persistRuntimeStateMock,
  readHistoryMock,
  readMemoryMarkdownMock,
} = vi.hoisted(() => ({
  spawnMemoryRefreshJobMock: vi.fn(),
  appendLogMock: vi.fn(async () => undefined),
  persistRuntimeStateMock: vi.fn(async () => undefined),
  readHistoryMock: vi.fn(async () => []),
  readMemoryMarkdownMock: vi.fn(async () => '# Memory'),
}))

vi.mock('../src/memory/refresh/job-spawn.js', () => ({
  spawnMemoryRefreshJob: spawnMemoryRefreshJobMock,
}))

vi.mock('../src/log/append.js', () => ({
  appendLog: appendLogMock,
}))

vi.mock('../src/orchestrator/core/runtime-persistence.js', () => ({
  persistRuntimeState: persistRuntimeStateMock,
}))

vi.mock('../src/history/store.js', () => ({
  readHistory: readHistoryMock,
}))

vi.mock('../src/memory/store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/memory/store.js')>()
  return {
    ...actual,
    readMemoryMarkdown: readMemoryMarkdownMock,
  }
})

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-memory-refresh-singleflight-'))
  tempDirs.push(dir)
  return dir
}

const buildRefreshOutput = (): MemoryRefreshSubprocessResult => ({
  mode: 'patch',
  reason: 'test_patch',
  entries: [
    {
      title: 'Preference',
      content: 'Keep latest user input.',
      evidenceIds: ['input-seeded'],
    },
  ],
  deleteEntryIds: [],
  harvest: { mode: 'patch', reason: 'ok' },
  curate: { mode: 'patch', reason: 'ok' },
  compress: { mode: 'patch', reason: 'ok' },
})

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const paths = buildPaths(workDir)
  await writeMemoryEntries(paths.memoryFile, [])
  return {
    runtimeId: 'runtime-memory-refresh-test',
    config,
    paths,
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    managerWakePending: false,
    lastManagerActivityAtMs: Date.now(),
    lastWorkerActivityAtMs: Date.now(),
    inflightInputs: [],
    queues: {
      inputsCursor: 100,
      resultsCursor: 0,
    },
    tasks: [],
    taskPlans: [],
    focuses: [],
    focusContexts: [],
    activeFocusIds: [],
    managerTurn: 40,
    memoryRefresh: {
      ...createDefaultMemoryRefreshState(),
      lastCompletedTurn: 20,
      lastProcessedInputsCursor: 90,
      lastProcessedResultsCursor: 0,
    },
    managerFocusCompressedContexts: [],
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: {
      add: vi.fn(),
      clear: vi.fn(),
      pause: vi.fn(),
      sizeBy: vi.fn().mockReturnValue(0),
    } as unknown as RuntimeState['workerQueue'],
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: null,
  }
}

const waitUntil = async (
  predicate: () => boolean,
  timeoutMs = 3_000,
  intervalMs = 20,
): Promise<void> => {
  const started = Date.now()
  for (;;) {
    if (predicate()) return
    if (Date.now() - started >= timeoutMs)
      throw new Error('memory_refresh_wait_timeout')
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs))
  }
}

beforeEach(() => {
  spawnMemoryRefreshJobMock.mockReset()
  appendLogMock.mockClear()
  persistRuntimeStateMock.mockClear()
  readHistoryMock.mockClear()
  readMemoryMarkdownMock.mockClear()
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('memory refresh reruns after pending signal while previous refresh is running', async () => {
  const runtime = await createRuntime()
  let releaseFirstCall: (() => void) | undefined
  const firstCallBlocked = new Promise<void>((resolve) => {
    releaseFirstCall = resolve
  })

  spawnMemoryRefreshJobMock
    .mockImplementationOnce(async () => {
      runtime.managerTurn = 41
      runtime.queues.inputsCursor = 101
      requestMemoryRefresh(runtime)
      await firstCallBlocked
      return buildRefreshOutput()
    })
    .mockImplementationOnce(async () => buildRefreshOutput())

  requestMemoryRefresh(runtime)
  releaseFirstCall?.()
  await waitUntil(
    () =>
      runtime.memoryRefresh.running === false &&
      spawnMemoryRefreshJobMock.mock.calls.length === 2,
  )

  expect(spawnMemoryRefreshJobMock).toHaveBeenCalledTimes(2)
  expect(runtime.memoryRefresh.pending).toBe(false)
  expect(runtime.memoryRefresh.lastProcessedInputsCursor).toBe(101)
})

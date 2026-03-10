import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'

import { defaultConfig } from '../../src/config.js'
import { GLOBAL_FOCUS_ID } from '../../src/focus/constants.js'
import { buildPaths } from '../../src/fs/paths.js'
import { createDefaultMemoryRefreshState } from '../../src/memory/refresh/state.js'

import type { RuntimeState } from '../../src/orchestrator/core/runtime-state.js'

type CreateTestRuntimeStateOptions = {
  workDir?: string
  runtimeId?: string
  maxConcurrent?: number
  withGlobalFocus?: boolean
  pausedQueue?: boolean
  patch?: {
    session?: Partial<RuntimeState['session']>
    manager?: Partial<RuntimeState['manager']>
    worker?: Partial<RuntimeState['worker']>
    ui?: Partial<RuntimeState['ui']>
    queues?: Partial<RuntimeState['queues']>
    tasks?: RuntimeState['tasks']
    taskPlans?: RuntimeState['taskPlans']
    focuses?: RuntimeState['focuses']
    focusContexts?: RuntimeState['focusContexts']
  }
}

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-test-runtime-'))

export const createTestRuntimeState = async (
  options: CreateTestRuntimeStateOptions = {},
): Promise<RuntimeState> => {
  const workDir = options.workDir ?? (await createTmpDir())
  const config = defaultConfig({ workDir })
  if (options.maxConcurrent) config.worker.maxConcurrent = options.maxConcurrent

  const queue = new PQueue({ concurrency: config.worker.maxConcurrent })
  if (options.pausedQueue) queue.pause()

  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  const focuses =
    options.patch?.focuses ??
    (options.withGlobalFocus === false
      ? []
      : [
          {
            id: GLOBAL_FOCUS_ID,
            title: 'Global',
            status: 'active',
            createdAt: now,
            updatedAt: now,
            lastActivityAt: now,
          },
        ])
  return {
    runtimeId: options.runtimeId ?? 'runtime-test',
    config,
    paths: buildPaths(workDir),
    session: {
      stopped: false,
      inflightInputs: [],
      ...options.patch?.session,
    },
    manager: {
      running: false,
      signalController: new AbortController(),
      wakePending: false,
      lastActivityAtMs: nowMs,
      turn: 0,
      memoryRefresh: createDefaultMemoryRefreshState(),
      focusCompressedContexts: [],
      compressedContext: '',
      ...options.patch?.manager,
    },
    worker: {
      lastActivityAtMs: nowMs,
      runningControllers: new Map(),
      runningTaskLocks: new Set(),
      createTaskDebounce: new Map(),
      queue,
      signalController: new AbortController(),
      ...options.patch?.worker,
    },
    ui: {
      wakeVersion: 0,
      wakeEvents: new Map(),
      signalControllers: new Set(),
      pendingUserChoice: null,
      ...options.patch?.ui,
    },
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
      ...options.patch?.queues,
    },
    tasks: options.patch?.tasks ?? [],
    taskPlans: options.patch?.taskPlans ?? [],
    focuses,
    focusContexts: options.patch?.focusContexts ?? [],
  }
}

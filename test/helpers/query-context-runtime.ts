import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect } from 'vitest'

import { defaultConfig } from '../../src/config.js'
import { buildPaths } from '../../src/fs/paths.js'
import { appendHistory } from '../../src/history/store.js'
import { pickQueryContextRequest } from '../../src/manager/query-context-tool.js'
import { appendTaskResultArchive } from '../../src/storage/task-results.js'

import type { QueryContextRequest } from '../../src/manager/query-context-tool.js'
import type { RuntimeState } from '../../src/orchestrator/core/runtime-state.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-query-context-'))

export const createQueryContextRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const paths = buildPaths(workDir)
  await mkdir(paths.memoryDir, { recursive: true })
  await writeFile(
    paths.memoryFile,
    [
      '# Deployment',
      'Use blue-green rollout',
      '',
      '# Incidents',
      'Track RCA checklist',
    ].join('\n'),
    'utf8',
  )
  await appendHistory(paths.history, {
    id: 'msg-1',
    role: 'user',
    text: 'deploy service alpha',
    createdAt: '2026-03-06T00:00:00.000Z',
    focusId: 'focus-release',
  })
  await appendHistory(paths.history, {
    id: 'msg-2',
    role: 'agent',
    text: 'deploy checklist ready',
    createdAt: '2026-03-06T01:00:00.000Z',
    focusId: 'focus-release',
  })
  await appendTaskResultArchive(workDir, {
    taskId: 'task-archive-1',
    focusId: 'focus-release',
    title: 'Deploy Archive One',
    status: 'succeeded',
    prompt: 'archive prompt',
    output: 'deploy output with details for archive lookup',
    createdAt: '2026-03-06T00:30:00.000Z',
    completedAt: '2026-03-06T01:30:00.000Z',
    durationMs: 1000,
  })
  await appendTaskResultArchive(workDir, {
    taskId: 'task-archive-2',
    focusId: 'focus-release',
    title: 'Deploy Archive Two',
    status: 'failed',
    prompt: 'archive prompt 2',
    output: 'deploy archive output with long content that can be truncated',
    createdAt: '2026-03-06T01:30:00.000Z',
    completedAt: '2026-03-06T02:30:00.000Z',
    durationMs: 1200,
  })

  const queue = new PQueue({ concurrency: 1 })
  queue.pause()
  return {
    runtimeId: 'runtime-test',
    config,
    paths,
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    managerWakePending: false,
    lastManagerActivityAtMs: Date.now(),
    lastWorkerActivityAtMs: Date.now(),
    inflightInputs: [],
    queues: { inputsCursor: 0, resultsCursor: 0 },
    tasks: [
      {
        id: 'task-1',
        fingerprint: 'fp-1',
        prompt: 'deploy api rollout',
        title: 'Deploy API',
        focusId: 'focus-release',
        profile: 'worker',
        status: 'running',
        createdAt: '2026-03-06T00:10:00.000Z',
      },
      {
        id: 'task-2',
        fingerprint: 'fp-2',
        prompt: 'cleanup backlog',
        title: 'Cleanup',
        focusId: 'focus-maintenance',
        profile: 'worker',
        status: 'pending',
        createdAt: '2026-03-05T00:10:00.000Z',
      },
    ],
    taskPlans: [
      {
        id: 'plan-1',
        prompt: 'deploy verification',
        title: 'Release Plan',
        focusId: 'focus-release',
        profile: 'worker',
        priority: 'normal',
        source: 'user_request',
        status: 'active',
        trigger: { mode: 'on_worker_slot_freed' },
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:40:00.000Z',
        runCount: 0,
      },
    ],
    focuses: [
      {
        id: 'focus-release',
        title: 'Release',
        status: 'active',
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:40:00.000Z',
        lastActivityAt: '2026-03-06T01:00:00.000Z',
      },
    ],
    focusContexts: [
      {
        focusId: 'focus-release',
        summary: 'deployment in progress',
        updatedAt: '2026-03-06T00:40:00.000Z',
      },
    ],
    activeFocusIds: ['focus-release'],
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

export const requireQueryContextRequest = (
  attrs: Record<string, string>,
): QueryContextRequest => {
  const request = pickQueryContextRequest([{ name: 'query_context', attrs }])
  expect(request).toBeDefined()
  return request as QueryContextRequest
}

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths, ensureStateDirs } from '../src/fs/paths.js'
import { consumeJsonpPackets } from '../src/streams/jsonp-channel.js'
import {
  publishTellerDigest,
  publishWorkerResult,
} from '../src/streams/channels.js'
import { thinkerLoop } from '../src/orchestrator/thinker-cycle.js'

import type { RuntimeState } from '../src/orchestrator/runtime-state.js'

vi.mock('../src/orchestrator/thinker-run-cycle.js', () => ({
  runThinkerCycle: vi.fn(async (runtime: RuntimeState) => {
    runtime.lastThinkerRunAt = Date.now()
  }),
}))

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-thinker-loop-prune-'))

test('thinker loop prunes worker-result and teller-digest channels', async () => {
  const stateDir = await createTmpDir()
  const config = defaultConfig({ stateDir, workDir: process.cwd() })
  config.thinker.pollMs = 5
  config.thinker.minIntervalMs = 0
  config.channels.pruneEnabled = true
  config.channels.keepRecentPackets = 2

  const paths = buildPaths(stateDir)
  await ensureStateDirs(paths)

  const runtime: RuntimeState = {
    config,
    paths,
    stopped: false,
    thinkerRunning: false,
    inflightInputs: [],
    lastThinkerRunAt: 0,
    channels: {
      teller: {
        userInputCursor: 0,
        thinkerDecisionCursor: 0,
      },
      thinker: {
        tellerDigestCursor: 0,
        workerResultCursor: 0,
      },
    },
    tasks: [],
    runningControllers: new Map(),
    workerQueue: {
      add: () => Promise.resolve(),
      onIdle: () => Promise.resolve(),
      size: 0,
      pending: 0,
      clear: () => undefined,
      pause: () => undefined,
      start: () => undefined,
      addAll: () => Promise.resolve([]),
      onEmpty: () => Promise.resolve(),
      onPendingZero: () => Promise.resolve(),
      timeout: undefined,
      concurrency: 1,
      isPaused: false,
      isSaturated: false,
      intervalCap: Infinity,
      interval: 0,
      carryoverConcurrencyCount: false,
      setPriority: () => undefined,
      runningTasks: [],
    } as RuntimeState['workerQueue'],
    workerSignalController: new AbortController(),
    evolveState: {},
  }

  await publishWorkerResult({
    paths,
    payload: {
      taskId: 'task-1',
      status: 'succeeded',
      ok: true,
      output: 'done-1',
      durationMs: 10,
      completedAt: '2026-02-09T00:00:01.000Z',
    },
  })
  await publishWorkerResult({
    paths,
    payload: {
      taskId: 'task-2',
      status: 'succeeded',
      ok: true,
      output: 'done-2',
      durationMs: 10,
      completedAt: '2026-02-09T00:00:02.000Z',
    },
  })
  await publishWorkerResult({
    paths,
    payload: {
      taskId: 'task-3',
      status: 'succeeded',
      ok: true,
      output: 'done-3',
      durationMs: 10,
      completedAt: '2026-02-09T00:00:03.000Z',
    },
  })

  await publishTellerDigest({
    paths,
    payload: {
      digestId: 'd-1',
      summary: 's1',
      inputs: [],
      results: [],
      taskSummary: {
        pending: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        canceled: 0,
        recent: [],
      },
    },
  })
  await publishTellerDigest({
    paths,
    payload: {
      digestId: 'd-2',
      summary: 's2',
      inputs: [],
      results: [],
      taskSummary: {
        pending: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        canceled: 0,
        recent: [],
      },
    },
  })
  await publishTellerDigest({
    paths,
    payload: {
      digestId: 'd-3',
      summary: 's3',
      inputs: [],
      results: [],
      taskSummary: {
        pending: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        canceled: 0,
        recent: [],
      },
    },
  })

  const loop = thinkerLoop(runtime)
  await new Promise((resolve) => setTimeout(resolve, 120))
  runtime.stopped = true
  await loop

  const workerPackets = await consumeJsonpPackets({
    path: paths.workerResultChannel,
    fromCursor: 0,
  })
  const digestPackets = await consumeJsonpPackets({
    path: paths.tellerDigestChannel,
    fromCursor: 0,
  })

  expect(workerPackets.map((item) => item.cursor)).toEqual([2, 3])
  expect(digestPackets.map((item) => item.cursor)).toEqual([2, 3])
})

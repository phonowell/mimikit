import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths, ensureStateDirs } from '../src/fs/paths.js'
import { consumeJsonpPackets } from '../src/streams/jsonp-channel.js'
import {
  publishThinkerDecision,
  publishUserInput,
} from '../src/streams/channels.js'
import { tellerLoop } from '../src/orchestrator/roles/teller/teller-loop.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

vi.mock('../src/teller/runner.js', () => ({
  formatDecisionForUser: vi.fn(async () => ({ text: 'ok' })),
  runTellerDigest: vi.fn(async () => ({
    digestId: 'digest-mock',
    summary: 'digest',
    inputs: [],
    taskSummary: {
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      canceled: 0,
      recent: [],
    },
  })),
}))

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-teller-loop-prune-'))

test('teller loop prunes user-input and thinker-decision channels', async () => {
  const stateDir = await createTmpDir()
  const config = defaultConfig({ stateDir, workDir: process.cwd() })
  config.teller.pollMs = 5
  config.teller.debounceMs = Number.MAX_SAFE_INTEGER
  config.channels.pruneEnabled = true
  config.channels.keepRecentPackets = 2

  const paths = buildPaths(stateDir)
  await ensureStateDirs(paths)

  const runtime: RuntimeState = {
    config,
    paths,
    stopped: false,
    thinkerRunning: false,
    inflightInputs: [
      {
        id: 'in-1',
        text: 'hello',
        createdAt: '2026-02-09T00:00:00.000Z',
      },
      {
        id: 'in-2',
        text: 'hello2',
        createdAt: '2026-02-09T00:00:01.000Z',
      },
      {
        id: 'in-3',
        text: 'hello3',
        createdAt: '2026-02-09T00:00:02.000Z',
      },
    ],
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

  await publishUserInput({
    paths,
    payload: {
      id: 'in-1',
      text: 'hello',
      createdAt: '2026-02-09T00:00:00.000Z',
    },
  })
  await publishUserInput({
    paths,
    payload: {
      id: 'in-2',
      text: 'hello2',
      createdAt: '2026-02-09T00:00:01.000Z',
    },
  })
  await publishUserInput({
    paths,
    payload: {
      id: 'in-3',
      text: 'hello3',
      createdAt: '2026-02-09T00:00:02.000Z',
    },
  })

  await publishThinkerDecision({
    paths,
    payload: {
      digestId: 'd1',
      decision: '收到',
      inputIds: ['in-1'],
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
  await publishThinkerDecision({
    paths,
    payload: {
      digestId: 'd2',
      decision: '继续',
      inputIds: ['in-2'],
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
  await publishThinkerDecision({
    paths,
    payload: {
      digestId: 'd3',
      decision: '完成',
      inputIds: ['in-3'],
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

  const loop = tellerLoop(runtime)
  await new Promise((resolve) => setTimeout(resolve, 80))
  runtime.stopped = true
  await loop

  const inputKept = await consumeJsonpPackets({
    path: paths.userInputChannel,
    fromCursor: 0,
  })
  const decisionKept = await consumeJsonpPackets({
    path: paths.thinkerDecisionChannel,
    fromCursor: 0,
  })

  expect(inputKept.map((item) => item.cursor)).toEqual([2, 3])
  expect(decisionKept.map((item) => item.cursor)).toEqual([2, 3])
})

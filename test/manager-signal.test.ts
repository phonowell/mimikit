import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import {
  notifyManagerLoop,
  waitForManagerLoopSignal,
} from '../src/orchestrator/core/manager-signal.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-signal-'))
  return {
    config: defaultConfig({ workDir }),
    paths: buildPaths(workDir),
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    inflightInputs: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
    tasks: [],
    cronJobs: [],
    runningControllers: new Map(),
    workerQueue: new PQueue({ concurrency: 1 }),
    workerSignalController: new AbortController(),
  }
}

test('manager signal wakes wait immediately', async () => {
  const runtime = await createRuntime()
  const startedAt = Date.now()
  const waiting = waitForManagerLoopSignal(runtime, 5_000)
  setTimeout(() => notifyManagerLoop(runtime), 20)
  await waiting
  const elapsed = Date.now() - startedAt
  expect(elapsed).toBeLessThan(1_000)
})

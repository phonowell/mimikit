import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

vi.mock('../src/manager/loop-batch.js', () => ({
  processManagerBatch: vi.fn(async () => {}),
}))

vi.mock('../src/manager/loop-trigger-plans.js', () => ({
  checkScheduledPlans: vi.fn(async () => ({
    triggeredCount: 0,
    stateChanged: false,
  })),
  triggerOnWorkerSlotFreedPlans: vi.fn(async () => ({
    triggeredCount: 0,
    stateChanged: false,
  })),
}))

vi.mock('../src/orchestrator/core/runtime-persistence.js', () => ({
  persistRuntimeState: vi.fn(async () => {}),
}))

vi.mock('../src/manager/runtime-adapter.js', () => ({
  waitForManagerLoopSignal: vi.fn(async (runtime: RuntimeState) => {
    runtime.session.stopped = true
  }),
}))

import { buildPaths } from '../src/fs/paths.js'
import { managerLoop } from '../src/manager/loop.js'
import { appendJsonl, readJsonl } from '../src/storage/jsonl.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { JsonPacket } from '../src/types/index.js'

const tempDirs: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('managerLoop defers result-only replay while replay cooldown is active', async () => {
  const workDir = await mkdtemp(
    join(tmpdir(), 'mimikit-manager-result-replay-'),
  )
  tempDirs.push(workDir)
  const runtime = await createTestRuntimeState({
    workDir,
    withGlobalFocus: false,
  })
  runtime.paths = buildPaths(workDir)
  runtime.manager.resultReplayReadyAtMs = Date.now() + 10_000
  runtime.manager.resultReplayFailureCount = 1

  await appendJsonl<JsonPacket<unknown>>(runtime.paths.resultsPackets, [
    {
      id: 'packet-worker-result',
      createdAt: '2026-03-09T00:00:00.000Z',
      payload: {
        taskId: 'task-1',
        status: 'succeeded',
        ok: true,
        output: 'done',
        durationMs: 1,
        completedAt: '2026-03-09T00:00:00.000Z',
      },
    },
  ])

  await managerLoop(runtime)

  const { processManagerBatch } = await import('../src/manager/loop-batch.js')
  const { waitForManagerLoopSignal } = await import(
    '../src/manager/runtime-adapter.js'
  )

  expect(processManagerBatch).not.toHaveBeenCalled()
  expect(waitForManagerLoopSignal).toHaveBeenCalledWith(
    runtime,
    expect.any(Number),
  )
  expect(vi.mocked(waitForManagerLoopSignal).mock.calls[0]?.[1]).toBeGreaterThan(
    8_000,
  )

  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  expect(logs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'manager_result_replay_deferred',
        resultsCount: 1,
      }),
    ]),
  )
})

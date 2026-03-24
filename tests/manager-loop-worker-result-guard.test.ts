import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'
import PQueue from 'p-queue'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const triggerMocks = vi.hoisted(() => ({
  checkScheduledPlans: vi.fn(async () => ({
    triggeredCount: 0,
    stateChanged: false,
  })),
  triggerOnWorkerSlotFreedPlans: vi.fn(async () => ({
    triggeredCount: 0,
    stateChanged: false,
  })),
}))

vi.mock('../src/policy/manager/loop-batch.js', () => ({
  processManagerBatch: vi.fn(async () => {}),
}))

vi.mock('../src/policy/manager/loop-trigger-plans.js', () => ({
  checkScheduledPlans: triggerMocks.checkScheduledPlans,
  triggerOnWorkerSlotFreedPlans: triggerMocks.triggerOnWorkerSlotFreedPlans,
}))

vi.mock('../src/kernel/orchestrator/runtime-persistence.js', () => ({
  persistRuntimeState: vi.fn(async () => {}),
}))

vi.mock('../src/kernel/orchestrator/signals.js', () => ({
  waitForManagerLoopSignal: vi.fn(async (runtime: RuntimeState) => {
    runtime.session.stopped = true
  }),
}))

import { buildPaths } from '../src/persistence/fs/paths.js'
import { readJsonl, appendJsonl } from '../src/persistence/storage/jsonl.js'
import { managerLoop } from '../src/policy/manager/loop.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'
import type { JsonPacket } from '../src/foundation/types/index.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-manager-loop-guard-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  vi.clearAllMocks()
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('managerLoop drops malformed worker results and logs schema issues', async () => {
  const workDir = await createTmpDir()
  const queue = new PQueue({ concurrency: 1 })
  queue.pause()
  const runtime = await createTestRuntimeState({
    workDir,
    withGlobalFocus: false,
  })
  runtime.paths = buildPaths(workDir)
  runtime.worker.queue = queue

  await appendJsonl<JsonPacket<unknown>>(runtime.paths.resultsPackets, [
    {
      id: 'packet-invalid-worker-result',
      createdAt: '2026-03-09T00:00:00.000Z',
      payload: {
        taskId: '',
        status: 'succeeded',
        ok: true,
        output: 'done',
        durationMs: -1,
        completedAt: '2026-03-09T00:00:00.000Z',
      },
    },
  ])

  await managerLoop(runtime)

  const { processManagerBatch } = await import('../src/policy/manager/loop-batch.js')
  const { persistRuntimeState } = await import(
    '../src/kernel/orchestrator/runtime-persistence.js'
  )

  expect(processManagerBatch).not.toHaveBeenCalled()
  expect(persistRuntimeState).toHaveBeenCalledOnce()
  expect(runtime.queues.resultsCursor).toBe(1)

  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  const invalidPacketLog = logs.find(
    (item) => item.event === 'invalid_worker_result_packet',
  )

  expect(invalidPacketLog).toMatchObject({
    event: 'invalid_worker_result_packet',
    packetId: 'packet-invalid-worker-result',
    cursor: 1,
  })
  expect(invalidPacketLog?.issues).toEqual(
    expect.arrayContaining([
      'taskId: Too small: expected string to have >=1 characters',
      'durationMs: Too small: expected number to be >=0',
    ]),
  )
})

test('managerLoop logs trigger errors and still processes queued inputs', async () => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    withGlobalFocus: false,
  })
  runtime.paths = buildPaths(workDir)
  triggerMocks.checkScheduledPlans.mockImplementationOnce(async () => {
    throw new Error('boom-trigger')
  })
  const { processManagerBatch } = await import('../src/policy/manager/loop-batch.js')
  vi.mocked(processManagerBatch).mockImplementationOnce(async (params) => {
    params.runtime.queues.inputsCursor = params.nextInputsCursor
    params.runtime.queues.resultsCursor = params.nextResultsCursor
    params.runtime.session.stopped = true
  })

  await appendJsonl<JsonPacket<unknown>>(runtime.paths.inputsPackets, [
    {
      id: 'packet-user-input',
      createdAt: '2026-03-09T00:00:00.000Z',
      payload: {
        id: 'input-user-1',
        role: 'user',
        text: 'hello',
        focusId: 'focus-inbox',
        createdAt: '2026-03-09T00:00:00.000Z',
      },
    },
  ])

  await managerLoop(runtime)

  expect(processManagerBatch).toHaveBeenCalledOnce()
  expect(runtime.queues.inputsCursor).toBe(1)

  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  expect(logs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'trigger_wake_error',
        error: 'boom-trigger',
      }),
    ]),
  )
})

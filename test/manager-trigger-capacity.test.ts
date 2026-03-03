import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { triggerWakeLoop } from '../src/manager/loop-trigger.js'
import {
  triggerOnIdlePlans,
  triggerOnWorkerSlotAvailablePlans,
} from '../src/manager/loop-trigger-plans.js'
import { hasWorkerSlotAvailable } from '../src/manager/loop-trigger-shared.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../src/types/index.js'

const GLOBAL_FOCUS_ID = 'focus-global'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-trigger-capacity-'))

const waitFor = async (
  check: () => boolean,
  timeoutMs = 3_500,
): Promise<void> => {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`wait_timeout_${timeoutMs}ms`)
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
}

const countSystemEvent = (runtime: RuntimeState, name: string): number =>
  runtime.inflightInputs.filter(
    (input) =>
      input.role === 'system' &&
      input.text.includes(`<M:system_event name="${name}"`),
  ).length

const createRuntime = async (params?: {
  maxConcurrent?: number
  idleDelayMs?: number
}): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  config.worker.maxConcurrent = Math.max(1, params?.maxConcurrent ?? 1)
  config.manager.idleTrigger.delayMs = Math.max(
    0,
    params?.idleDelayMs ?? 60_000,
  )
  const queue = new PQueue({ concurrency: config.worker.maxConcurrent })
  const now = new Date().toISOString()

  return {
    runtimeId: 'runtime-test',
    config,
    paths: buildPaths(workDir),
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    managerWakePending: false,
    lastManagerActivityAtMs: Date.now(),
    lastWorkerActivityAtMs: Date.now(),
    inflightInputs: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
    tasks: [],
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
    uiStream: null,
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

const createPlan = (
  id: string,
  trigger: TaskPlan['trigger'],
): TaskPlan => {
  const now = new Date().toISOString()
  return {
    id,
    prompt: id,
    title: id,
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    priority: 'normal',
    source: 'user_request',
    status: 'active',
    trigger,
    createdAt: now,
    updatedAt: now,
    runCount: 0,
  }
}

test('worker slot availability tracks queue capacity transitions', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  expect(hasWorkerSlotAvailable(runtime)).toBe(true)

  const releases: Array<() => void> = []
  void runtime.workerQueue.add(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve)
      }),
    { id: 'task-block-1' },
  )
  void runtime.workerQueue.add(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve)
      }),
    { id: 'task-block-2' },
  )

  await waitFor(() => runtime.workerQueue.pending === 2)
  expect(hasWorkerSlotAvailable(runtime)).toBe(false)

  releases.shift()?.()
  await waitFor(() => runtime.workerQueue.pending === 1)
  expect(hasWorkerSlotAvailable(runtime)).toBe(true)

  releases.shift()?.()
  await runtime.workerQueue.onIdle()
})

test('on_worker_slot_available plans trigger without regressing on_idle', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  runtime.taskPlans.push(
    createPlan('plan-capacity', { mode: 'on_worker_slot_available' }),
    createPlan('plan-idle', { mode: 'on_idle', cooldownMs: 0 }),
  )

  const capacityTriggered = await triggerOnWorkerSlotAvailablePlans(
    runtime,
    Date.now(),
  )
  expect(capacityTriggered).toEqual({ triggeredCount: 1, stateChanged: true })
  expect(runtime.taskPlans[0]?.runCount).toBe(1)
  expect(runtime.taskPlans[1]?.runCount).toBe(0)
  expect(countSystemEvent(runtime, 'trigger_fire')).toBe(1)

  const idleTriggered = await triggerOnIdlePlans(runtime, Date.now())
  expect(idleTriggered).toEqual({ triggeredCount: 1, stateChanged: true })
  expect(runtime.taskPlans[1]?.runCount).toBe(1)
})

test('triggerWakeLoop emits worker_slot_available on full-to-free transition only once', async () => {
  const runtime = await createRuntime({ maxConcurrent: 1, idleDelayMs: 60_000 })
  runtime.runningControllers.set('task-busy', new AbortController())

  const loopPromise = triggerWakeLoop(runtime)
  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 1_200))
    expect(countSystemEvent(runtime, 'worker_slot_available')).toBe(0)

    runtime.runningControllers.clear()
    runtime.lastWorkerActivityAtMs = Date.now()

    await waitFor(
      () => countSystemEvent(runtime, 'worker_slot_available') >= 1,
      4_000,
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 1_300))
    expect(countSystemEvent(runtime, 'worker_slot_available')).toBe(1)
  } finally {
    runtime.stopped = true
    await loopPromise
  }
})

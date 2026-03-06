import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import { triggerWakeLoop } from '../src/manager/loop-trigger.js'
import { triggerOnWorkerSlotFreedPlans } from '../src/manager/loop-trigger-plans.js'
import { hasFreeWorkerSlot } from '../src/manager/loop-trigger-shared.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../src/types/index.js'

const GLOBAL_FOCUS_ID = 'focus-global'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-trigger-capacity-'))

const createTestConfig = (
  workDir: string,
  maxConcurrent: number,
): RuntimeState['config'] => ({
  workDir,
  manager: {
    model: 'gpt-test-manager',
    modelReasoningEffort: 'minimal',
    provider: {},
    maxCorrectionRounds: 1,
    promptSections: {
      actionFeedbackMaxBytes: 2048,
      batchResultsMaxBytes: 4096,
      compressedContextMaxBytes: 4096,
      environmentMaxBytes: 2048,
      fileLookupMaxBytes: 4096,
      focusContextsMaxBytes: 4096,
      focusListMaxBytes: 2048,
      historyLookupMaxBytes: 4096,
      inputsMaxBytes: 2048,
      memoryMaxBytes: 2048,
      plansMaxBytes: 4096,
      queryLookupMaxBytes: 4096,
      recentHistoryMaxBytes: 2048,
      tasksMaxBytes: 4096,
    },
    taskCreate: { debounceMs: 0 },
    taskWindow: { minCount: 1, maxCount: 5 },
    planWindow: { minCount: 1, maxCount: 5 },
  },
  worker: {
    maxConcurrent,
    retry: { maxAttempts: 1, backoffMs: 1 },
    timeoutMs: 60_000,
    model: 'gpt-test-worker',
    modelReasoningEffort: 'minimal',
  },
  webui: {
    enabled: true,
  },
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
  },
})

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
}): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = createTestConfig(workDir, Math.max(1, params?.maxConcurrent ?? 1))
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
  expect(hasFreeWorkerSlot(runtime)).toBe(true)

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
  expect(hasFreeWorkerSlot(runtime)).toBe(false)

  releases.shift()?.()
  await waitFor(() => runtime.workerQueue.pending === 1)
  expect(hasFreeWorkerSlot(runtime)).toBe(true)

  releases.shift()?.()
  await runtime.workerQueue.onIdle()
})

test('on_worker_slot_freed plans trigger without touching non-capacity plans', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  runtime.taskPlans.push(
    createPlan('plan-capacity', { mode: 'on_worker_slot_freed' }),
    createPlan('plan-cron', { mode: 'cron', cron: '* * * * *' }),
  )

  const capacityTriggered = await triggerOnWorkerSlotFreedPlans(
    runtime,
    Date.now(),
  )
  expect(capacityTriggered).toEqual({ triggeredCount: 1, stateChanged: true })
  expect(runtime.taskPlans[0]?.runCount).toBe(1)
  expect(runtime.taskPlans[1]?.runCount).toBe(0)
  expect(countSystemEvent(runtime, 'trigger_fire')).toBe(1)
})

test('trigger_fire system event uses global focus even when plan has local focus', async () => {
  const runtime = await createRuntime({ maxConcurrent: 1 })
  const plan = createPlan('plan-local-focus', { mode: 'on_worker_slot_freed' })
  plan.focusId = 'focus-local'
  runtime.taskPlans.push(plan)

  const triggered = await triggerOnWorkerSlotFreedPlans(runtime, Date.now())
  expect(triggered.triggeredCount).toBe(1)
  const triggerInput = runtime.inflightInputs.find(
    (input) =>
      input.role === 'system' &&
      input.text.includes('<M:system_event name="trigger_fire"'),
  )
  expect(triggerInput?.focusId).toBe(GLOBAL_FOCUS_ID)
})

test(
  'triggerWakeLoop fires on_worker_slot_freed once on full-to-free transition',
  async () => {
    const runtime = await createRuntime({ maxConcurrent: 1 })
    runtime.taskPlans.push(createPlan('plan-capacity', { mode: 'on_worker_slot_freed' }))
    runtime.runningControllers.set('task-busy', new AbortController())

    const loopPromise = triggerWakeLoop(runtime)
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_200))
      expect(runtime.taskPlans[0]?.runCount).toBe(0)

      runtime.runningControllers.clear()
      runtime.lastWorkerActivityAtMs = Date.now()

      await waitFor(() => (runtime.taskPlans[0]?.runCount ?? 0) >= 1, 4_000)
      await new Promise<void>((resolve) => setTimeout(resolve, 1_200))

      expect(runtime.taskPlans[0]?.runCount).toBe(1)
      expect(countSystemEvent(runtime, 'worker_slot_freed')).toBe(0)
    } finally {
      runtime.stopped = true
      await loopPromise
    }
  },
  12_000,
)

test('triggerWakeLoop emits worker_slot_freed on full-to-free transition only once', async () => {
  const runtime = await createRuntime({ maxConcurrent: 1 })
  runtime.runningControllers.set('task-busy', new AbortController())

  const loopPromise = triggerWakeLoop(runtime)
  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 1_200))
    expect(countSystemEvent(runtime, 'worker_slot_freed')).toBe(0)

    runtime.runningControllers.clear()
    runtime.lastWorkerActivityAtMs = Date.now()

    await waitFor(
      () => countSystemEvent(runtime, 'worker_slot_freed') >= 1,
      4_000,
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 1_300))
    expect(countSystemEvent(runtime, 'worker_slot_freed')).toBe(1)
  } finally {
    runtime.stopped = true
    await loopPromise
  }
})

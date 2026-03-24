import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { beforeEach, expect, test, vi } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'
import { notifyManagerLoop } from '../src/kernel/orchestrator/signals.js'
import { readJsonl } from '../src/persistence/storage/jsonl.js'
import { managerLoop } from '../src/policy/manager/loop.js'
import { triggerOnWorkerSlotFreedPlans } from '../src/policy/manager/loop-trigger-plans.js'
import { hasFreeWorkerSlot } from '../src/execution/worker/task-state-shared.js'
import {
  createCapacityPlan,
  waitForCondition,
} from './helpers/manager-trigger-capacity.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const { runManagerRoundWithRecoveryMock } = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

vi.mock('../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: runManagerRoundWithRecoveryMock,
}))

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-trigger-capacity-'))
const settle = (ms = 150) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  runManagerRoundWithRecoveryMock.mockReset()
  runManagerRoundWithRecoveryMock.mockResolvedValue({
    output: '',
    elapsedMs: 0,
    promptPrefixHash: 'manager-trigger-capacity-test',
  })
})

const createTestConfig = (
  workDir: string,
  maxConcurrent: number,
): RuntimeState['config'] => ({
  workDir,
  manager: {
    model: 'gpt-test-manager',
    modelReasoningEffort: 'minimal',
    baseUrl: '',
    apiKey: '',
    proxy: '',
    maxCorrectionRounds: 1,
    promptSections: {
      actionFeedbackMaxBytes: 2048,
      batchResultsMaxBytes: 4096,
      environmentMaxBytes: 2048,
      focusListMaxBytes: 2048,
      inputsMaxBytes: 2048,
      memoryMaxBytes: 2048,
      packetSummaryMaxBytes: 4096,
      plansMaxBytes: 4096,
      recentHistoryMaxBytes: 2048,
      tasksMaxBytes: 4096,
      workingFocusesMaxBytes: 4096,
    },
    taskCreate: { debounceMs: 0 },
    taskWindow: { minCount: 1, maxCount: 5 },
    planWindow: { minCount: 1, maxCount: 5 },
  },
  worker: {
    maxConcurrent,
    retry: { maxAttempts: 1, backoffMs: 1 },
    timeoutMs: 60_000,
  },
  codex: {
    enabled: true,
    model: 'gpt-test-codex',
    modelReasoningEffort: 'minimal',
    capability: 'medium',
    billing: 'low',
    proxy: '',
  },
  webui: {
    enabled: true,
    port: 8787,
  },
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
  },
  feishu: {
    enabled: false,
    appId: '',
    appSecret: '',
    chatId: '',
  },
})

const countSystemEvent = async (
  runtime: RuntimeState,
  name: string,
): Promise<number> => {
  const packets = await readJsonl<{
    payload?: {
      role?: string
      systemEventName?: string
    }
  }>(
    runtime.paths.inputsPackets,
    { ensureFile: true },
  )
  return packets.filter((packet) => {
    const payload = packet.payload
    return payload?.role === 'system' && payload.systemEventName === name
  }).length
}

const createRuntime = async (params?: {
  maxConcurrent?: number
}): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    maxConcurrent: Math.max(1, params?.maxConcurrent ?? 1),
  })
  runtime.config = createTestConfig(
    workDir,
    Math.max(1, params?.maxConcurrent ?? 1),
  )
  runtime.worker.queue = new PQueue({
    concurrency: runtime.config.worker.maxConcurrent,
  })
  return runtime
}

const stopLoop = async (
  runtime: RuntimeState,
  loopPromise: Promise<void>,
): Promise<void> => {
  runtime.session.stopped = true
  notifyManagerLoop(runtime)
  await loopPromise
}

test('worker slot availability tracks queue capacity transitions', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  expect(hasFreeWorkerSlot(runtime)).toBe(true)

  const releases: Array<() => void> = []
  void runtime.worker.queue.add(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve)
      }),
    { id: 'task-block-1' },
  )
  void runtime.worker.queue.add(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve)
      }),
    { id: 'task-block-2' },
  )

  await waitForCondition(() => runtime.worker.queue.pending === 2)
  expect(hasFreeWorkerSlot(runtime)).toBe(false)

  releases.shift()?.()
  await waitForCondition(() => runtime.worker.queue.pending === 1)
  expect(hasFreeWorkerSlot(runtime)).toBe(true)

  releases.shift()?.()
  await runtime.worker.queue.onIdle()
})

test('managerLoop emits worker_slot_freed once on startup when slot is already free', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  runtime.tasks.push({
    id: 'task-pending-seed',
    fingerprint: 'fp-task-pending-seed',
    prompt: 'seed prompt',
    title: 'seed task',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    status: 'pending',
    createdAt: new Date().toISOString(),
  })

  const loopPromise = managerLoop(runtime)
  try {
    await waitForCondition(
      async () => (await countSystemEvent(runtime, 'worker_slot_freed')) >= 1,
      4_000,
    )
    await settle()
    expect(await countSystemEvent(runtime, 'worker_slot_freed')).toBe(1)
  } finally {
    await stopLoop(runtime, loopPromise)
  }
})

test('managerLoop suppresses worker_slot_freed when no queue work exists', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })

  const loopPromise = managerLoop(runtime)
  try {
    await settle()
    expect(await countSystemEvent(runtime, 'worker_slot_freed')).toBe(0)
  } finally {
    await stopLoop(runtime, loopPromise)
  }
})

test('on_worker_slot_freed plans trigger without touching non-capacity plans', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  runtime.taskPlans.push(
    createCapacityPlan(
      'plan-capacity',
      { mode: 'on_worker_slot_freed' },
      GLOBAL_FOCUS_ID,
    ),
    createCapacityPlan(
      'plan-cron',
      { mode: 'cron', cron: '* * * * *' },
      GLOBAL_FOCUS_ID,
    ),
  )

  const capacityTriggered = await triggerOnWorkerSlotFreedPlans(
    runtime,
    Date.now(),
    runtime.config.worker.maxConcurrent,
  )
  expect(capacityTriggered).toEqual({ triggeredCount: 1, stateChanged: true })
  expect(runtime.taskPlans[0]?.runtime.runCount).toBe(1)
  expect(runtime.taskPlans[1]?.runtime.runCount).toBe(0)
  expect(await countSystemEvent(runtime, 'trigger_fire')).toBe(1)
})

test('trigger_fire system event uses global focus even when plan has local focus', async () => {
  const runtime = await createRuntime({ maxConcurrent: 1 })
  const plan = createCapacityPlan(
    'plan-local-focus',
    { mode: 'on_worker_slot_freed' },
    GLOBAL_FOCUS_ID,
  )
  plan.focusId = 'focus-local'
  runtime.taskPlans.push(plan)

  const triggered = await triggerOnWorkerSlotFreedPlans(
    runtime,
    Date.now(),
    runtime.config.worker.maxConcurrent,
  )
  expect(triggered.triggeredCount).toBe(1)
  const triggerInput = runtime.session.inflightInputs.find(
    (input) => input.role === 'system' && input.systemEventName === 'trigger_fire',
  )
  expect(triggerInput?.focusId).toBe(GLOBAL_FOCUS_ID)
})

test(
  'managerLoop fires on_worker_slot_freed once on full-to-free transition',
  async () => {
    const runtime = await createRuntime({ maxConcurrent: 1 })
    runtime.taskPlans.push(
      createCapacityPlan(
        'plan-capacity',
        { mode: 'on_worker_slot_freed' },
        GLOBAL_FOCUS_ID,
      ),
    )
    runtime.worker.runningControllers.set('task-busy', new AbortController())

    const loopPromise = managerLoop(runtime)
    try {
      await settle()
      expect(runtime.taskPlans[0]?.runtime.runCount).toBe(0)

      runtime.worker.runningControllers.clear()
      runtime.worker.lastActivityAtMs = Date.now()
      notifyManagerLoop(runtime)

      await waitForCondition(
        () => (runtime.taskPlans[0]?.runtime.runCount ?? 0) >= 1,
        4_000,
      )
      await settle()

      expect(runtime.taskPlans[0]?.runtime.runCount).toBe(1)
      expect(await countSystemEvent(runtime, 'worker_slot_freed')).toBe(0)
    } finally {
      await stopLoop(runtime, loopPromise)
    }
  },
  20_000,
)

test('managerLoop emits worker_slot_freed on full-to-free transition only once', async () => {
  const runtime = await createRuntime({ maxConcurrent: 1 })
  runtime.tasks.push({
    id: 'task-pending-transition',
    fingerprint: 'fp-task-pending-transition',
    prompt: 'transition prompt',
    title: 'transition task',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    status: 'pending',
    createdAt: new Date().toISOString(),
  })
  runtime.worker.runningControllers.set('task-busy', new AbortController())

  const loopPromise = managerLoop(runtime)
  try {
    await settle()
    expect(await countSystemEvent(runtime, 'worker_slot_freed')).toBe(0)

    runtime.worker.runningControllers.clear()
    runtime.worker.lastActivityAtMs = Date.now()
    notifyManagerLoop(runtime)

    await waitForCondition(
      async () => (await countSystemEvent(runtime, 'worker_slot_freed')) >= 1,
      4_000,
    )
    await settle()
    expect(await countSystemEvent(runtime, 'worker_slot_freed')).toBe(1)
  } finally {
    await stopLoop(runtime, loopPromise)
  }
})

test(
  'managerLoop coalesces burst worker releases while capacity remains free',
  async () => {
    const runtime = await createRuntime({ maxConcurrent: 3 })
    runtime.tasks.push({
      id: 'task-pending-burst',
      fingerprint: 'fp-task-pending-burst',
      prompt: 'burst prompt',
      title: 'burst task',
      focusId: GLOBAL_FOCUS_ID,
      profile: 'worker',
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
    runtime.worker.runningControllers.set('task-1', new AbortController())
    runtime.worker.runningControllers.set('task-2', new AbortController())
    runtime.worker.runningControllers.set('task-3', new AbortController())

    const loopPromise = managerLoop(runtime)
    try {
      await settle()
      expect(await countSystemEvent(runtime, 'worker_slot_freed')).toBe(0)

      runtime.worker.runningControllers.delete('task-1')
      runtime.worker.lastActivityAtMs = Date.now()
      runtime.worker.runningControllers.delete('task-2')
      runtime.worker.lastActivityAtMs = Date.now()
      runtime.worker.runningControllers.delete('task-3')
      runtime.worker.lastActivityAtMs = Date.now()
      notifyManagerLoop(runtime)
      await waitForCondition(
        async () => (await countSystemEvent(runtime, 'worker_slot_freed')) >= 1,
        4_000,
      )

      await settle()
      expect(await countSystemEvent(runtime, 'worker_slot_freed')).toBe(1)
    } finally {
      await stopLoop(runtime, loopPromise)
    }
  },
  20_000,
)

test(
  'managerLoop reacts when occupied worker count drops while slot stays available',
  async () => {
    const runtime = await createRuntime({ maxConcurrent: 1 })
    runtime.taskPlans.push(
      createCapacityPlan(
        'plan-capacity',
        { mode: 'on_worker_slot_freed' },
        GLOBAL_FOCUS_ID,
      ),
    )
    runtime.worker.runningControllers.set('task-busy', new AbortController())

    const loopPromise = managerLoop(runtime)
    try {
      await settle()
      expect(runtime.taskPlans[0]?.runtime.runCount).toBe(0)

      runtime.worker.runningControllers.clear()
      runtime.worker.lastActivityAtMs = Date.now()
      notifyManagerLoop(runtime)

      await waitForCondition(
        () => (runtime.taskPlans[0]?.runtime.runCount ?? 0) >= 1,
        4_000,
      )
      expect(runtime.taskPlans[0]?.runtime.runCount).toBe(1)
      expect(await countSystemEvent(runtime, 'worker_slot_freed')).toBe(0)
    } finally {
      await stopLoop(runtime, loopPromise)
    }
  },
  20_000,
)

import PQueue from 'p-queue'
import { beforeEach, expect, test, vi } from 'vitest'

import { safeProcessLoopTriggers } from '../src/policy/manager/loop-triggers.js'
import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'

import {
  createCapacityPlan,
  waitForCondition,
} from './helpers/manager-trigger-capacity.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { WorkerLlmResult } from '../src/execution/worker/run-retry.js'
import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const { runTaskWithRetryMock } = vi.hoisted(() => ({
  runTaskWithRetryMock: vi.fn(),
}))

vi.mock('../src/execution/worker/run-retry.js', () => ({
  runTaskWithRetry: runTaskWithRetryMock,
}))

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ maxConcurrent: 2 })
  runtime.config.codex.enabled = true
  runtime.process.worker.queue = new PQueue({
    concurrency: runtime.config.worker.maxConcurrent,
  })
  return runtime
}

beforeEach(() => {
  runTaskWithRetryMock.mockReset()
})

test('safeProcessLoopTriggers preserves release-edge detection after a plan consumes the freed slot', async () => {
  const runtime = await createRuntime()
  const firstPlan = await createCapacityPlan(
    runtime,
    'task-one',
    { mode: 'on_worker_slot_freed' },
    GLOBAL_FOCUS_ID,
  )
  firstPlan.id = 'plan-edge-1'
  runtime.domain.taskPlans.push(firstPlan)
  const secondPlan = await createCapacityPlan(
    runtime,
    'task-two',
    { mode: 'on_worker_slot_freed' },
    GLOBAL_FOCUS_ID,
  )
  secondPlan.id = 'plan-edge-2'
  runtime.domain.taskPlans.push(secondPlan)

  let resolveFirstRun: (() => void) | undefined
  const firstRunDone = new Promise<void>((resolve) => {
    resolveFirstRun = resolve
  })
  runTaskWithRetryMock.mockImplementationOnce(
    async (): Promise<WorkerLlmResult> => {
      await firstRunDone
      return { output: 'done', elapsedMs: 1 }
    },
  )

  runtime.process.worker.runningControllers.set(
    'task-busy-initial',
    new AbortController(),
  )
  const triggerState = {
    lastAvailableSlots: null,
    workerSlotEventPending: false,
    lastWorkerSlotEventAtMs: 0,
  }

  const firstChanged = await safeProcessLoopTriggers(runtime, triggerState)

  await waitForCondition(() =>
    runtime.process.worker.runningControllers.has(
      runtime.domain.tasks[0]?.id ?? '',
    ),
  )
  expect(firstChanged).toBe(true)
  expect(runtime.domain.taskPlans[0]?.runtime.runCount).toBe(1)
  expect(runtime.domain.taskPlans[1]?.runtime.runCount).toBe(0)
  expect(triggerState.lastAvailableSlots).toBe(0)

  runtime.process.worker.runningControllers.delete('task-busy-initial')
  triggerState.lastWorkerSlotEventAtMs = 0

  const secondChanged = await safeProcessLoopTriggers(runtime, triggerState)

  expect(secondChanged).toBe(true)
  expect(runtime.domain.taskPlans[1]?.runtime.runCount).toBe(1)
  expect(runtime.domain.tasks.map((task) => task.title)).toEqual([
    'task-one',
    'task-two',
  ])

  resolveFirstRun?.()
  await runtime.process.worker.queue.onIdle()
})

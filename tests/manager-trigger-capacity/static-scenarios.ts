import { expect, test } from 'vitest'

import { hasFreeWorkerSlot } from '../../src/execution/worker/task-state-shared.js'
import { triggerOnWorkerSlotFreedPlans } from '../../src/policy/manager/loop-trigger-plans.js'
import { managerLoop } from '../../src/policy/manager/loop.js'
import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import {
  createCapacityPlan,
  waitForCondition,
} from '../helpers/manager-trigger-capacity.js'

import {
  countAgentReplies,
  countSystemEvent,
  createRuntime,
  settle,
  stopLoop,
} from './testkit.js'

test('worker slot availability tracks queue capacity transitions', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  expect(hasFreeWorkerSlot(runtime)).toBe(true)

  const releases: Array<() => void> = []
  void runtime.process.worker.queue.add(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve)
      }),
    { id: 'task-block-1' },
  )
  void runtime.process.worker.queue.add(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve)
      }),
    { id: 'task-block-2' },
  )

  await waitForCondition(() => runtime.process.worker.queue.pending === 2)
  expect(hasFreeWorkerSlot(runtime)).toBe(false)

  releases.shift()?.()
  await waitForCondition(() => runtime.process.worker.queue.pending === 1)
  expect(hasFreeWorkerSlot(runtime)).toBe(true)

  releases.shift()?.()
  await runtime.process.worker.queue.onIdle()
})

test('managerLoop emits worker_slot_freed once on startup when slot is already free', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  runtime.domain.tasks.push({
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

test('managerLoop does not append fallback agent reply for worker_slot_freed-only wakeups', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  runtime.domain.tasks.push({
    id: 'task-pending-worker-slot-only',
    fingerprint: 'fp-task-pending-worker-slot-only',
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

    expect(await countAgentReplies(runtime, '继续处理。')).toBe(0)
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
  runtime.domain.taskPlans.push(
    await createCapacityPlan(
      runtime,
      'plan-capacity',
      { mode: 'on_worker_slot_freed' },
      GLOBAL_FOCUS_ID,
    ),
    await createCapacityPlan(
      runtime,
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
  expect(runtime.domain.taskPlans[0]?.runtime.runCount).toBe(1)
  expect(runtime.domain.taskPlans[1]?.runtime.runCount).toBe(0)
  expect(await countSystemEvent(runtime, 'trigger_fire')).toBe(1)
})

test('trigger_fire wakeups do not append fallback agent reply when manager output is empty', async () => {
  const runtime = await createRuntime({ maxConcurrent: 2 })
  runtime.domain.taskPlans.push(
    await createCapacityPlan(
      runtime,
      'plan-capacity-trigger-only',
      { mode: 'on_worker_slot_freed' },
      GLOBAL_FOCUS_ID,
    ),
  )

  const loopPromise = managerLoop(runtime)
  try {
    await waitForCondition(
      () => (runtime.domain.taskPlans[0]?.runtime.runCount ?? 0) >= 1,
      4_000,
    )
    await settle()

    expect(await countSystemEvent(runtime, 'trigger_fire')).toBe(1)
    expect(await countAgentReplies(runtime, '继续处理。')).toBe(0)
  } finally {
    await stopLoop(runtime, loopPromise)
  }
})

test('trigger_fire system event uses global focus even when plan has local focus', async () => {
  const runtime = await createRuntime({ maxConcurrent: 1 })
  const plan = await createCapacityPlan(
    runtime,
    'plan-local-focus',
    { mode: 'on_worker_slot_freed' },
    GLOBAL_FOCUS_ID,
  )
  plan.focusId = 'focus-local'
  runtime.domain.taskPlans.push(plan)

  const triggered = await triggerOnWorkerSlotFreedPlans(
    runtime,
    Date.now(),
    runtime.config.worker.maxConcurrent,
  )
  expect(triggered.triggeredCount).toBe(1)
  const triggerInput = runtime.process.session.inflightInputs.find(
    (input) =>
      input.role === 'system' && input.systemEventName === 'trigger_fire',
  )
  expect(triggerInput?.focusId).toBe(GLOBAL_FOCUS_ID)
})

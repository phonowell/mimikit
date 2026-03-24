import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { managerLoop } from '../../src/policy/manager/loop.js'
import { notifyManagerLoop } from '../../src/kernel/orchestrator/signals.js'
import {
  createCapacityPlan,
  waitForCondition,
} from '../helpers/manager-trigger-capacity.js'

import {
  countSystemEvent,
  createRuntime,
  settle,
  stopLoop,
} from './testkit.js'

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

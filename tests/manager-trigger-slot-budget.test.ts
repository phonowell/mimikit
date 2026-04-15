import { expect, test } from 'vitest'

import { triggerOnWorkerSlotFreedPlans } from '../src/policy/manager/loop-trigger-plans.js'
import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'

import { createCapacityPlan } from './helpers/manager-trigger-capacity.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const createRuntime = async () => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

test('on_worker_slot_freed enqueue plans respect available slot budget', async () => {
  const runtime = await createRuntime()
  const highPlan = await createCapacityPlan(
    runtime,
    'task-one',
    { mode: 'on_worker_slot_freed' },
    GLOBAL_FOCUS_ID,
  )
  highPlan.id = 'plan-enqueue-1'
  highPlan.priority = 'high'
  runtime.domain.taskPlans.push(highPlan)
  const normalPlan = await createCapacityPlan(
    runtime,
    'task-two',
    { mode: 'on_worker_slot_freed' },
    GLOBAL_FOCUS_ID,
  )
  normalPlan.id = 'plan-enqueue-2'
  runtime.domain.taskPlans.push(normalPlan)

  const triggered = await triggerOnWorkerSlotFreedPlans(runtime, Date.now(), 1)

  expect(triggered).toEqual({ triggeredCount: 1, stateChanged: true })
  expect(runtime.domain.tasks).toHaveLength(1)
  expect(runtime.domain.tasks[0]?.title).toBe('task-one')
  expect(runtime.domain.taskPlans[0]?.runtime.runCount).toBe(1)
  expect(runtime.domain.taskPlans[1]?.runtime.runCount).toBe(0)
})

test('on_worker_slot_freed plans do not run when no slot is available', async () => {
  const runtime = await createRuntime()
  const plan = await createCapacityPlan(
    runtime,
    'task-one',
    { mode: 'on_worker_slot_freed' },
    GLOBAL_FOCUS_ID,
  )
  plan.id = 'plan-enqueue-1'
  plan.priority = 'high'
  runtime.domain.taskPlans.push(plan)

  const triggered = await triggerOnWorkerSlotFreedPlans(runtime, Date.now(), 0)

  expect(triggered).toEqual({ triggeredCount: 0, stateChanged: false })
  expect(runtime.domain.tasks).toHaveLength(0)
  expect(runtime.domain.taskPlans[0]?.runtime.runCount).toBe(0)
})

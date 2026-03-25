import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'
import { triggerOnWorkerSlotFreedPlans } from '../src/policy/manager/loop-trigger-plans.js'
import { persistTaskExecutionSpec } from '../src/work/spec/store.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
} from '../src/work/orchestrator/task-state.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'
import type { TaskPlan } from '../src/foundation/types/index.js'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ maxConcurrent: 1 })
  runtime.config.codex.enabled = true
  runtime.worker.queue.pause()
  return runtime
}

const createEnqueuePlan = async (
  id: string,
  priority: TaskPlan['priority'],
  title: string,
  runtime: RuntimeState,
): Promise<TaskPlan> => {
  const now = new Date().toISOString()
  const prompt = `run ${title}`
  const contract = {
    goal: `Goal for ${title}`,
    scope: `Scope for ${title}`,
    acceptance: [`Accept ${title}`],
  }
  const spec = await persistTaskExecutionSpec({
    stateDir: runtime.config.workDir,
    prompt,
    contract,
    specId: `spec-${id}`,
  })
  return {
    id,
    title: id,
    focusId: GLOBAL_FOCUS_ID,
    priority,
    status: 'active',
    trigger: { mode: 'on_worker_slot_freed' },
    effect: {
      kind: 'enqueue_task',
      taskTemplate: {
        title,
        executionSpecId: spec.id,
        fingerprint: buildTaskFingerprint({
          prompt,
          title,
          cwd: runtime.paths.root,
          profile: 'worker',
          provider: 'codex',
          focusId: GLOBAL_FOCUS_ID,
          contract,
        }),
        semanticKey: buildTaskSemanticKey({
          prompt,
          title,
          cwd: runtime.paths.root,
          profile: 'worker',
          provider: 'codex',
          focusId: GLOBAL_FOCUS_ID,
          contract,
        }),
        cwd: runtime.paths.root,
      },
    },
    createdAt: now,
    updatedAt: now,
    runtime: { runCount: 0 },
  }
}

test('on_worker_slot_freed enqueue plans respect available slot budget', async () => {
  const runtime = await createRuntime()
  runtime.taskPlans.push(
    await createEnqueuePlan('plan-enqueue-1', 'high', 'task-one', runtime),
    await createEnqueuePlan('plan-enqueue-2', 'normal', 'task-two', runtime),
  )

  const triggered = await triggerOnWorkerSlotFreedPlans(runtime, Date.now(), 1)

  expect(triggered).toEqual({ triggeredCount: 1, stateChanged: true })
  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.title).toBe('task-one')
  expect(runtime.taskPlans[0]?.runtime.runCount).toBe(1)
  expect(runtime.taskPlans[1]?.runtime.runCount).toBe(0)
})

test('on_worker_slot_freed wake_manager plans do not consume slot budget', async () => {
  const runtime = await createRuntime()
  const now = new Date().toISOString()
  runtime.taskPlans.push(
    {
      id: 'plan-wake-manager',
      title: 'plan-wake-manager',
      focusId: GLOBAL_FOCUS_ID,
      priority: 'high',
      status: 'active',
      trigger: { mode: 'on_worker_slot_freed' },
      effect: {
        kind: 'wake_manager',
        reason: 'capacity_retry',
      },
      createdAt: now,
      updatedAt: now,
      runtime: { runCount: 0 },
    },
    await createEnqueuePlan('plan-enqueue-1', 'normal', 'task-one', runtime),
  )

  const triggered = await triggerOnWorkerSlotFreedPlans(runtime, Date.now(), 1)

  expect(triggered).toEqual({ triggeredCount: 2, stateChanged: true })
  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.title).toBe('task-one')
  expect(runtime.taskPlans[0]?.runtime.runCount).toBe(1)
  expect(runtime.taskPlans[1]?.runtime.runCount).toBe(1)
})

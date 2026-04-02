import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { triggerOnWorkerSlotFreedPlans } from '../src/policy/manager/loop-trigger-plans.js'
import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const buildTaskDraft = (title: string, cwd: string) => ({
  title,
  cwd,
  mode: 'write' as const,
  goal: `Deliver ${title}`,
  in_scope: [`Only handle ${title}`],
  out_of_scope: [],
  done_when: [`${title} finished`],
  context_refs: [],
  instructions: [],
})

const createRuntime = async () => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

const createEnqueuePlan = async (
  id: string,
  priority: 'high' | 'normal' | 'low',
  title: string,
  runtime: Awaited<ReturnType<typeof createRuntime>>,
) => {
  const now = new Date().toISOString()
  const taskCwd = join(runtime.config.workDir, title)
  await mkdir(taskCwd, { recursive: true })
  const task = buildTaskDraft(title, taskCwd)
  await import('../src/policy/manager/action-plan-effect-enqueue.js').then(
    async ({ buildPlanEnqueueTaskEffect }) => {
      const effect = await buildPlanEnqueueTaskEffect({
        stateDir: runtime.config.workDir,
        focusId: GLOBAL_FOCUS_ID,
        task,
      })
      runtime.domain.taskPlans.push({
        id,
        title,
        focusId: GLOBAL_FOCUS_ID,
        priority,
        status: 'active',
        trigger: { mode: 'on_worker_slot_freed' },
        effect,
        createdAt: now,
        updatedAt: now,
        runtime: { runCount: 0 },
      })
    },
  )
  return runtime.domain.taskPlans[runtime.domain.taskPlans.length - 1]
}

test('on_worker_slot_freed enqueue plans respect available slot budget', async () => {
  const runtime = await createRuntime()
  await createEnqueuePlan('plan-enqueue-1', 'high', 'task-one', runtime)
  await createEnqueuePlan('plan-enqueue-2', 'normal', 'task-two', runtime)

  const triggered = await triggerOnWorkerSlotFreedPlans(runtime, Date.now(), 1)

  expect(triggered).toEqual({ triggeredCount: 1, stateChanged: true })
  expect(runtime.domain.tasks).toHaveLength(1)
  expect(runtime.domain.tasks[0]?.title).toBe('task-one')
  expect(runtime.domain.taskPlans[0]?.runtime.runCount).toBe(1)
  expect(runtime.domain.taskPlans[1]?.runtime.runCount).toBe(0)
})

test('on_worker_slot_freed plans do not run when no slot is available', async () => {
  const runtime = await createRuntime()
  await createEnqueuePlan('plan-enqueue-1', 'high', 'task-one', runtime)

  const triggered = await triggerOnWorkerSlotFreedPlans(runtime, Date.now(), 0)

  expect(triggered).toEqual({ triggeredCount: 0, stateChanged: false })
  expect(runtime.domain.tasks).toHaveLength(0)
  expect(runtime.domain.taskPlans[0]?.runtime.runCount).toBe(0)
})

import { buildPlanEnqueueTaskEffect } from '../../src/policy/manager/action-plan-effect-enqueue.js'

import type { TaskPlan } from '../../src/foundation/types/index.js'
import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

export const waitForCondition = async (
  check: () => boolean | Promise<boolean>,
  timeoutMs = 3_500,
): Promise<void> => {
  const startedAt = Date.now()
  while (!(await check())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`wait_timeout_${timeoutMs}ms`)
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
}

export const createCapacityPlan = async (
  runtime: RuntimeState,
  id: string,
  trigger: TaskPlan['trigger'],
  focusId: string,
): Promise<TaskPlan> => {
  const now = new Date().toISOString()
  const effect = await buildPlanEnqueueTaskEffect({
    stateDir: runtime.config.workDir,
    focusId,
    task: {
      title: id,
      cwd: `/tmp/${id}`,
      mode: 'write',
      goal: `Deliver ${id}`,
      in_scope: [`Only handle ${id}`],
      out_of_scope: [],
      done_when: [`${id} finished`],
      context_refs: [],
      instructions: [],
    },
  })
  return {
    id,
    title: id,
    focusId,
    priority: 'normal',
    status: 'active',
    trigger,
    effect,
    createdAt: now,
    updatedAt: now,
    runtime: {
      runCount: 0,
    },
  }
}

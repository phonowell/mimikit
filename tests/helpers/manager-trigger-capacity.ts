import type { TaskPlan } from '../../src/foundation/types/index.js'

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

export const createCapacityPlan = (
  id: string,
  trigger: TaskPlan['trigger'],
  focusId: string,
): TaskPlan => {
  const now = new Date().toISOString()
  return {
    id,
    title: id,
    focusId,
    priority: 'normal',
    status: 'active',
    trigger,
    effect: {
      kind: 'wake_manager',
      reason: 'capacity_retry',
    },
    createdAt: now,
    updatedAt: now,
    runtime: {
      runCount: 0,
    },
  }
}

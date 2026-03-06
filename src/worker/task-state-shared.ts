import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

export const resolveTaskChangeAt = (task: Task): string =>
  task.completedAt ?? task.pausedAt ?? task.startedAt ?? task.createdAt

export const resolveSlotStatus = (runtime: RuntimeState) => {
  const maxSlots = runtime.config.worker.maxConcurrent
  const occupiedSlots = runtime.runningControllers.size
  return {
    max_slots: maxSlots,
    occupied_slots: occupiedSlots,
    available_slots: Math.max(0, maxSlots - occupiedSlots),
  }
}

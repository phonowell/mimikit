import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
export { resolveTaskChangeAt } from '../shared/task-state.js'

export const resolveSlotStatus = (runtime: RuntimeState) => {
  const maxSlots = Math.max(1, runtime.config.worker.maxConcurrent)
  const occupied = Math.max(
    runtime.worker.queue.pending,
    runtime.worker.runningControllers.size,
  )
  const occupiedSlots = Math.min(maxSlots, Math.max(0, occupied))
  return {
    max_slots: maxSlots,
    occupied_slots: occupiedSlots,
    available_slots: Math.max(0, maxSlots - occupiedSlots),
  }
}

export const hasFreeWorkerSlot = (runtime: RuntimeState): boolean =>
  resolveSlotStatus(runtime).available_slots > 0

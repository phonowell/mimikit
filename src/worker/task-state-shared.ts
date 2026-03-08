import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
export { resolveTaskChangeAt } from '../shared/task-state.js'

export const resolveSlotStatus = (runtime: RuntimeState) => {
  const maxSlots = runtime.config.worker.maxConcurrent
  const occupiedSlots = runtime.runningControllers.size
  return {
    max_slots: maxSlots,
    occupied_slots: occupiedSlots,
    available_slots: Math.max(0, maxSlots - occupiedSlots),
  }
}

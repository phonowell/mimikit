import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
export { resolveTaskChangeAt } from '../../work/shared/task-state.js'

export const resolveSlotStatus = (runtime: WorkerRuntime) => {
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

export const hasFreeWorkerSlot = (runtime: WorkerRuntime): boolean =>
  resolveSlotStatus(runtime).available_slots > 0

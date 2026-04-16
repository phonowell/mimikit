import { resolveSlotStatus } from '../../execution/worker/task-state-shared.js'

import type {
  ManagerEnv,
  ManagerWakeProfile,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const buildManagerEnv = (
  runtime: ManagerRuntime,
  wakeProfile: ManagerWakeProfile,
): ManagerEnv => {
  const slots = resolveSlotStatus(runtime)
  return {
    ...(runtime.process.session.lastUserMeta
      ? { lastUser: runtime.process.session.lastUserMeta }
      : {}),
    wakeProfile,
    workerSlots: {
      maxSlots: slots.max_slots,
      occupiedSlots: slots.occupied_slots,
      availableSlots: slots.available_slots,
    },
  }
}

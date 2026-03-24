import { resolveSystemEvent } from '../../surface/shared/system-event.js'

import type { UserInput } from '../../foundation/types/index.js'

export const collectTriggeredPlanIds = (inputs: UserInput[]): Set<string> => {
  const ids = new Set<string>()
  for (const input of inputs) {
    if (input.role !== 'system') continue
    const event = resolveSystemEvent(input)
    if (event.name !== 'trigger_fire') continue
    const id =
      typeof event.payload?.plan_id === 'string'
        ? event.payload.plan_id.trim()
        : ''
    if (id) ids.add(id)
  }
  return ids
}

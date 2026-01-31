import { newId } from '../ids.js'
import { nowIso } from '../time.js'

import type { Task, Trigger } from '../types/tasks.js'

export const taskFromTrigger = (params: {
  trigger: Trigger
  prompt?: string
}): Task => {
  const { trigger } = params
  const prompt = params.prompt ?? trigger.prompt
  return {
    id: newId(),
    type: 'oneshot',
    prompt,
    priority: trigger.priority,
    createdAt: nowIso(),
    attempts: 0,
    timeout: trigger.timeout ?? null,
    sourceTriggerId: trigger.id,
    triggeredAt: nowIso(),
    ...(trigger.traceId ? { traceId: trigger.traceId } : {}),
    ...(trigger.parentTaskId ? { parentTaskId: trigger.parentTaskId } : {}),
  }
}

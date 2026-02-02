import { newId } from '../ids.js'
import { nowIso } from '../time.js'
import { TASK_SCHEMA_VERSION } from '../types/schema.js'
import { summaryFromCandidates } from './summary.js'

import type { Task, Trigger } from '../types/tasks.js'

export const taskFromTrigger = (params: {
  trigger: Trigger
  prompt?: string
}): Task => {
  const { trigger } = params
  const prompt = params.prompt ?? trigger.prompt
  const summary = summaryFromCandidates([prompt])
  const now = nowIso()
  return {
    schemaVersion: TASK_SCHEMA_VERSION,
    id: newId(),
    type: 'oneshot',
    prompt,
    ...(summary ? { summary } : {}),
    priority: trigger.priority,
    createdAt: now,
    attempts: 0,
    timeout: trigger.timeout ?? null,
    sourceTriggerId: trigger.id,
    triggeredAt: now,
    ...(trigger.traceId ? { traceId: trigger.traceId } : {}),
    ...(trigger.parentTaskId ? { parentTaskId: trigger.parentTaskId } : {}),
  }
}

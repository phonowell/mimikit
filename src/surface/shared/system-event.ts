export type SystemEventName =
  | 'startup'
  | 'task_created'
  | 'task_paused'
  | 'task_resumed'
  | 'task_canceled'
  | 'task_completed'
  | 'manager_fallback_reply'
  | 'manager_round_limit'
  | 'manager_error'
  | 'trigger_fire'
  | 'worker_slot_freed'
  | 'plan_created'
  | 'plan_updated'
  | 'plan_deleted'
  | 'memory_remembered'
  | 'project_profile_remembered'

export type ParsedSystemEvent = {
  summary: string
  name?: string
  payload?: Record<string, unknown>
}

export type SystemEventRecord = {
  text: string
  systemEventName: SystemEventName
  systemEventPayload: Record<string, unknown>
}

export type SystemEventCarrier = {
  text: string
  systemEventName?: string
  systemEventPayload?: Record<string, unknown>
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined

const normalizeSystemEventName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export const createSystemEventRecord = (params: {
  summary: string
  event: SystemEventName
  payload: Record<string, unknown>
}): SystemEventRecord => ({
  text: params.summary.trim(),
  systemEventName: params.event,
  systemEventPayload: params.payload,
})

export const resolveSystemEvent = (
  source: SystemEventCarrier,
): ParsedSystemEvent => {
  const summary = source.text.trim()
  const name = normalizeSystemEventName(source.systemEventName)
  const payload = asRecord(source.systemEventPayload)
  return {
    summary,
    ...(name ? { name } : {}),
    ...(payload ? { payload } : {}),
  }
}

export const hasSystemEvent = (
  source: SystemEventCarrier,
  name: SystemEventName,
): boolean => resolveSystemEvent(source).name === name

export type SystemEventName =
  | 'startup'
  | 'task_created'
  | 'task_canceled'
  | 'task_completed'
  | 'manager_fallback_reply'
  | 'manager_round_limit'
  | 'manager_error'
  | 'action_feedback'
  | 'trigger_fire'
  | 'worker_slots_idle'
  | 'worker_slot_freed'
  | 'user_choice'
  | 'user_choice_skipped'
  | 'plan_created'
  | 'plan_updated'
  | 'plan_deleted'
  | 'session_summary_restored'

export type ParsedSystemEvent = {
  summary: string
  name?: string
  payload?: Record<string, unknown>
}

const SYSTEM_EVENT_TAG_PATTERN =
  /<M:system_event\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/M:system_event>/i

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined

const toInlineJson = (payload: Record<string, unknown>): string =>
  JSON.stringify(payload).replace(/[<>&]/g, (char) => {
    if (char === '<') return '\\u003c'
    if (char === '>') return '\\u003e'
    return '\\u0026'
  })

export const formatSystemEventText = (params: {
  summary: string
  event: SystemEventName
  payload: Record<string, unknown>
}): string => {
  const summary = params.summary.trim()
  const metaTag = `<M:system_event name="${params.event}" version="1">${toInlineJson(params.payload)}</M:system_event>`
  if (!summary) return metaTag
  return `${summary}\n\n${metaTag}`
}

export const parseSystemEventText = (text: string): ParsedSystemEvent => {
  const source = text.trim()
  if (!source) return { summary: '' }
  const matched = source.match(SYSTEM_EVENT_TAG_PATTERN)
  if (!matched) return { summary: source }

  const fullTag = matched[0]
  const name = matched[1]?.trim()
  const payloadRaw = matched[2]?.trim()
  const summary = source.replace(fullTag, '').trim()

  if (!payloadRaw) return { summary, ...(name ? { name } : {}) }
  try {
    const parsedPayload = asRecord(JSON.parse(payloadRaw))
    return {
      summary,
      ...(name ? { name } : {}),
      ...(parsedPayload ? { payload: parsedPayload } : {}),
    }
  } catch {
    return { summary, ...(name ? { name } : {}) }
  }
}

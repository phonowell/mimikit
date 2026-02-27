export type SystemEventName =
  | 'startup'
  | 'task_created'
  | 'task_canceled'
  | 'task_completed'
  | 'manager_fallback_reply'
  | 'manager_round_limit'
  | 'manager_error'
  | 'action_feedback'
  | 'cron_trigger'
  | 'idle'
  | 'cron_canceled'
  | 'intent_trigger'
  | 'intent_created'
  | 'intent_updated'
  | 'intent_deleted'

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

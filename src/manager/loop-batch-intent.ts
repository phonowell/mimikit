import type { UserInput } from '../types/index.js'
import { logSafeError } from '../log/safe.js'

const INTENT_TRIGGER_EVENT_RE =
  /<M:system_event[^>]*name="intent_trigger"[^>]*>([\s\S]*?)<\/M:system_event>/g

export const collectTriggeredIntentIds = (inputs: UserInput[]): Set<string> => {
  const ids = new Set<string>()
  for (const input of inputs) {
    if (input.role !== 'system') continue
    if (!input.text.includes('name="intent_trigger"')) continue
    INTENT_TRIGGER_EVENT_RE.lastIndex = 0
    let match = INTENT_TRIGGER_EVENT_RE.exec(input.text)
    while (match) {
      const raw = match[1]?.trim()
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { intent_id?: unknown }
          const id =
            typeof payload.intent_id === 'string'
              ? payload.intent_id.trim()
              : ''
          if (id) ids.add(id)
        } catch (error) {
          const rawPreview =
            raw.length > 120 ? `${raw.slice(0, 120)}...` : raw
          void logSafeError('collectTriggeredIntentIds:parse_payload', error, {
            meta: { rawPreview },
          })
        }
      }
      match = INTENT_TRIGGER_EVENT_RE.exec(input.text)
    }
  }
  return ids
}

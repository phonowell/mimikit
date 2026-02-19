import { escapeCdata, stringifyPromptYaml } from './format-base.js'

import type { ConversationFocus } from '../types/index.js'

const toFocusEntries = (focuses: ConversationFocus[]) =>
  focuses.map((focus) => ({
    id: focus.id,
    status: focus.status,
    title: focus.title,
    summary: focus.summary,
    confidence: Number(focus.confidence.toFixed(3)),
    evidence_ids: [...focus.evidenceIds],
    updated_at: focus.updatedAt,
    last_referenced_at: focus.lastReferencedAt,
  }))

export const formatFocusesYaml = (focuses: ConversationFocus[]): string => {
  if (focuses.length === 0) return ''
  return escapeCdata(
    stringifyPromptYaml({
      focuses: toFocusEntries(focuses),
    }),
  )
}

export const formatFocusControlYaml = (params: {
  turn: number
  maxSlots: number
  updateRequired: boolean
  reason: 'periodic' | 'result_event' | 'bootstrap' | 'idle'
}): string =>
  escapeCdata(
    stringifyPromptYaml({
      focus_control: {
        turn: params.turn,
        max_slots: params.maxSlots,
        update_required: params.updateRequired,
        reason: params.reason,
      },
    }),
  )

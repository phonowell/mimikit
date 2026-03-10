import {
  escapeCdata,
  parseIsoToMs,
  stringifyPromptJson,
} from './format-base.js'

import type { FocusListEntry, FocusPromptContextEntry } from '../focus/index.js'

const sortMessagesDesc = <T extends { time: string; id: string }>(
  entries: T[],
): T[] =>
  [...entries].sort((a, b) => {
    const at = parseIsoToMs(a.time)
    const bt = parseIsoToMs(b.time)
    if (at !== bt) return bt - at
    return a.id.localeCompare(b.id)
  })

export const buildFocusListPromptPayload = (focusList: FocusListEntry[]) => ({
  focuses: focusList.map((focus) => ({
    id: focus.id,
    title: focus.title,
    status: focus.status,
    is_active: focus.isActive,
    updated_at: focus.updatedAt,
    last_activity_at: focus.lastActivityAt,
  })),
})

export const formatFocusList = (focusList: FocusListEntry[]): string => {
  if (focusList.length === 0) return ''
  return escapeCdata(
    stringifyPromptJson(buildFocusListPromptPayload(focusList)),
  )
}

export const buildFocusContextsPromptPayload = (
  contexts: FocusPromptContextEntry[],
) => ({
  focuses: contexts.map((focus) => ({
    focus_id: focus.focusId,
    title: focus.title,
    status: focus.status,
    ...(focus.summary ? { summary: focus.summary } : {}),
    ...(focus.openItems && focus.openItems.length > 0
      ? { open_items: focus.openItems }
      : {}),
    recent_messages: sortMessagesDesc(
      focus.recentMessages
        .map((message) => {
          const content = message.text.trim()
          if (!content) return null
          return {
            id: message.id,
            role: message.role,
            time: message.createdAt,
            ...(message.quote ? { quote: message.quote } : {}),
            content,
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ),
  })),
})

export const formatFocusContexts = (
  contexts: FocusPromptContextEntry[],
): string => {
  if (contexts.length === 0) return ''
  return escapeCdata(
    stringifyPromptJson(buildFocusContextsPromptPayload(contexts)),
  )
}

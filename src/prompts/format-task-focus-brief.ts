import { truncateText } from '../shared/text.js'

import { stringifyPromptJson } from './format-base.js'

import type { FocusId } from '../types/index.js'

const MAX_FOCUS_TITLE_CHARS = 80
const MAX_FOCUS_SUMMARY_CHARS = 320
const MAX_OPEN_ITEMS = 6
const MAX_OPEN_ITEM_CHARS = 120

export type TaskFocusBrief = {
  focusId: FocusId
  title?: string
  summary?: string
  openItems?: string[]
  updatedAt?: string
  lastActivityAt?: string
}

const normalizeLine = (
  value: string | undefined,
  maxChars: number,
): string | undefined => {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return truncateText(trimmed, maxChars, { normalizeWhitespace: true })
}

const normalizeOpenItems = (
  items: string[] | undefined,
): string[] | undefined => {
  if (!items) return undefined
  const normalized = items
    .map((item) => normalizeLine(item, MAX_OPEN_ITEM_CHARS))
    .filter((item): item is string => Boolean(item))
  if (normalized.length === 0) return undefined
  return normalized.slice(0, MAX_OPEN_ITEMS)
}

export const formatTaskFocusBrief = (brief?: TaskFocusBrief): string => {
  if (!brief) return ''
  const focusId = brief.focusId.trim()
  if (!focusId) return ''
  const focusTitle = normalizeLine(brief.title, MAX_FOCUS_TITLE_CHARS)
  const summary = normalizeLine(brief.summary, MAX_FOCUS_SUMMARY_CHARS)
  const openItems = normalizeOpenItems(brief.openItems)
  if (!focusTitle && !summary && !openItems) return ''

  return stringifyPromptJson({
    focus_id: focusId,
    ...(focusTitle ? { focus_title: focusTitle } : {}),
    ...(summary ? { summary } : {}),
    ...(openItems ? { open_items: openItems } : {}),
    ...(brief.updatedAt ? { updated_at: brief.updatedAt } : {}),
    ...(brief.lastActivityAt ? { last_activity_at: brief.lastActivityAt } : {}),
  })
}

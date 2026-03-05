import { truncateText } from '../shared/text.js'

import { stringifyPromptYaml } from './format-base.js'

import type { FocusContext, FocusId, FocusMeta } from '../types/index.js'

const MAX_FOCUS_TITLE_CHARS = 80
const MAX_FOCUS_SUMMARY_CHARS = 320
const MAX_COMPRESSED_SUMMARY_CHARS = 900
const MAX_OPEN_ITEMS = 6
const MAX_OPEN_ITEM_CHARS = 120

type WorkerFocusPromptParams = {
  focusId: FocusId
  focusMeta?: FocusMeta
  focusContext?: FocusContext
  compressedFocusContext?: WorkerCompressedFocusContext
}

export type WorkerCompressedFocusContext = {
  focusId: FocusId
  summary: string
  updatedAt: string
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

export const formatWorkerFocusContext = (
  params: WorkerFocusPromptParams,
): string => {
  const focusId = params.focusId.trim()
  if (!focusId) return ''
  const focusTitle = normalizeLine(
    params.focusMeta?.title,
    MAX_FOCUS_TITLE_CHARS,
  )
  const summary = normalizeLine(
    params.focusContext?.summary,
    MAX_FOCUS_SUMMARY_CHARS,
  )
  const openItems = normalizeOpenItems(params.focusContext?.openItems)
  const compressedSummary = normalizeLine(
    params.compressedFocusContext?.summary,
    MAX_COMPRESSED_SUMMARY_CHARS,
  )
  if (!focusTitle && !summary && !openItems && !compressedSummary) return ''

  return stringifyPromptYaml({
    focus_id: focusId,
    ...(focusTitle ? { focus_title: focusTitle } : {}),
    ...(summary ? { summary } : {}),
    ...(openItems ? { open_items: openItems } : {}),
    ...(params.focusContext?.updatedAt
      ? { context_updated_at: params.focusContext.updatedAt }
      : {}),
    ...(compressedSummary ? { compressed_summary: compressedSummary } : {}),
    ...(params.compressedFocusContext?.updatedAt
      ? { compressed_updated_at: params.compressedFocusContext.updatedAt }
      : {}),
  })
}

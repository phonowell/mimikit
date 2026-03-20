import { isVisibleToAgent } from '../shared/message-visibility.js'
import { compareIsoDesc } from '../shared/time.js'

import {
  MAX_FOCUS_OPEN_ITEMS,
  MAX_FOCUS_RECENT_BYTES,
  MAX_RECENT_HISTORY_BYTES,
  MIN_RECENT_MESSAGES,
} from './constants.js'
import { normalizeFocusOpenItems } from './open-items.js'
import { canStoreFocusDetails } from './reserved.js'

import type { FocusId, FocusMeta, HistoryMessage } from '../types/index.js'

export type FocusListEntry = {
  id: FocusId
  title: string
  status: FocusMeta['status']
  isActive: boolean
  updatedAt: string
  lastActivityAt: string
}

export type WorkingFocusEntry = {
  focusId: FocusId
  title: string
  status: FocusMeta['status']
  summary?: string
  openItems?: string[]
  recentMessages: HistoryMessage[]
}

export type FocusPromptPayload = {
  focusList: FocusListEntry[]
  workingFocuses: WorkingFocusEntry[]
  recentHistory: HistoryMessage[]
}

type MessageWithBytes = {
  message: HistoryMessage
  bytes: number
}

const compareMessageDesc = (a: HistoryMessage, b: HistoryMessage): number => {
  const diff = compareIsoDesc(a.createdAt, b.createdAt)
  if (diff !== 0) return diff
  return b.id.localeCompare(a.id)
}

const toVisibleMessages = (history: HistoryMessage[]): HistoryMessage[] =>
  history.filter(
    (item) => isVisibleToAgent(item) && item.text.trim().length > 0,
  )

const toMessageBytes = (message: HistoryMessage): number =>
  Buffer.byteLength(
    JSON.stringify({
      id: message.id,
      role: message.role,
      time: message.createdAt,
      focusId: message.focusId,
      text: message.text,
      ...(message.quote ? { quote: message.quote } : {}),
    }),
    'utf8',
  )

const selectRecentMessagesByBudget = (
  messages: HistoryMessage[],
  maxBytes: number,
): HistoryMessage[] => {
  if (messages.length === 0) return []
  const newestFirst = [...messages].sort(compareMessageDesc)
  const required = Math.min(MIN_RECENT_MESSAGES, newestFirst.length)
  const selected: MessageWithBytes[] = newestFirst.map((message) => ({
    message,
    bytes: toMessageBytes(message),
  }))
  let total = selected.reduce((sum, item) => sum + item.bytes, 0)
  while (total > maxBytes && selected.length > required) {
    const removed = selected.pop()
    if (!removed) break
    total -= removed.bytes
  }
  return selected.map((item) => item.message)
}

const compareFocusByActivityDesc = (a: FocusMeta, b: FocusMeta): number => {
  const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
  if (diff !== 0) return diff
  return a.id.localeCompare(b.id)
}

export const buildFocusPromptPayload = (params: {
  focuses: FocusMeta[]
  history: HistoryMessage[]
  workingFocusIds: FocusId[]
}): FocusPromptPayload => {
  const visible = toVisibleMessages(params.history)
  const primaryFocusId = params.workingFocusIds[0]?.trim() || undefined
  const scopedVisible = primaryFocusId
    ? visible.filter((item) => item.focusId === primaryFocusId)
    : visible
  const focusById = new Map(params.focuses.map((focus) => [focus.id, focus]))

  const focusList = params.focuses
    .filter((focus) => focus.status !== 'archived')
    .sort(compareFocusByActivityDesc)
    .map((focus) => ({
      id: focus.id,
      title: focus.title,
      status: focus.status,
      isActive: focus.status === 'active',
      updatedAt: focus.updatedAt,
      lastActivityAt: focus.lastActivityAt,
    }))

  const recentFocusMessageIds = new Set<string>()
  const workingFocuses: WorkingFocusEntry[] = []
  for (const focusId of primaryFocusId ? [primaryFocusId] : []) {
    if (!canStoreFocusDetails(focusId)) continue
    const focus = focusById.get(focusId)
    if (!focus || focus.status === 'archived') continue
    const summary = focus.summary?.trim()
    const openItems = normalizeFocusOpenItems(focus.openItems, {
      maxItems: MAX_FOCUS_OPEN_ITEMS,
    })
    const focusMessages = scopedVisible.filter((item) => item.focusId === focusId)
    const recentMessages = selectRecentMessagesByBudget(
      focusMessages,
      MAX_FOCUS_RECENT_BYTES,
    )
    for (const message of recentMessages) recentFocusMessageIds.add(message.id)
    if (
      !summary &&
      (!openItems || openItems.length === 0) &&
      recentMessages.length === 0
    )
      continue
    workingFocuses.push({
      focusId,
      title: focus.title,
      status: focus.status,
      ...(summary ? { summary } : {}),
      ...(openItems && openItems.length > 0 ? { openItems } : {}),
      recentMessages,
    })
  }

  const recentHistory = selectRecentMessagesByBudget(
    scopedVisible.filter((item) => !recentFocusMessageIds.has(item.id)),
    MAX_RECENT_HISTORY_BYTES,
  )

  return {
    focusList,
    workingFocuses,
    recentHistory,
  }
}

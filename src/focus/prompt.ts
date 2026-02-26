import { isVisibleToAgent } from '../shared/message-visibility.js'

import {
  MAX_FOCUS_OPEN_ITEMS,
  MAX_FOCUS_RECENT_BYTES,
  MAX_RECENT_HISTORY_BYTES,
  MIN_RECENT_MESSAGES,
} from './constants.js'

import type {
  FocusContext,
  FocusId,
  FocusMeta,
  HistoryMessage,
} from '../types/index.js'

export type FocusListEntry = {
  id: FocusId
  title: string
  status: FocusMeta['status']
  isActive: boolean
  updatedAt: string
  lastActivityAt: string
}

export type FocusPromptContextEntry = {
  focusId: FocusId
  title: string
  status: FocusMeta['status']
  summary?: string
  openItems?: string[]
  recentMessages: HistoryMessage[]
}

export type FocusPromptPayload = {
  focusList: FocusListEntry[]
  focusContexts: FocusPromptContextEntry[]
  recentHistory: HistoryMessage[]
}

type MessageWithBytes = {
  message: HistoryMessage
  bytes: number
}

const compareMessageDesc = (a: HistoryMessage, b: HistoryMessage): number => {
  const at = Date.parse(a.createdAt)
  const bt = Date.parse(b.createdAt)
  if (at !== bt) return bt - at
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
  const at = Date.parse(a.lastActivityAt)
  const bt = Date.parse(b.lastActivityAt)
  if (at !== bt) return bt - at
  return a.id.localeCompare(b.id)
}

export const buildFocusPromptPayload = (params: {
  focuses: FocusMeta[]
  focusContexts: FocusContext[]
  activeFocusIds: FocusId[]
  history: HistoryMessage[]
  workingFocusIds: FocusId[]
}): FocusPromptPayload => {
  const visible = toVisibleMessages(params.history)
  const focusById = new Map(params.focuses.map((focus) => [focus.id, focus]))
  const focusContextById = new Map(
    params.focusContexts.map((context) => [context.focusId, context]),
  )

  const focusList = params.focuses
    .filter((focus) => focus.status !== 'archived')
    .sort(compareFocusByActivityDesc)
    .map((focus) => ({
      id: focus.id,
      title: focus.title,
      status: focus.status,
      isActive: params.activeFocusIds.includes(focus.id),
      updatedAt: focus.updatedAt,
      lastActivityAt: focus.lastActivityAt,
    }))

  const recentFocusMessageIds = new Set<string>()
  const focusContexts: FocusPromptContextEntry[] = []
  for (const focusId of params.workingFocusIds) {
    const focus = focusById.get(focusId)
    if (!focus || focus.status === 'archived') continue
    const context = focusContextById.get(focusId)
    const summary = context?.summary?.trim()
    const openItems = context?.openItems
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, MAX_FOCUS_OPEN_ITEMS)
    const focusMessages = visible.filter((item) => item.focusId === focusId)
    const recentMessages = selectRecentMessagesByBudget(
      focusMessages,
      MAX_FOCUS_RECENT_BYTES,
    )
    for (const message of recentMessages) recentFocusMessageIds.add(message.id)
    if (!summary && (!openItems || openItems.length === 0) && recentMessages.length === 0)
      continue
    focusContexts.push({
      focusId,
      title: focus.title,
      status: focus.status,
      ...(summary ? { summary } : {}),
      ...(openItems && openItems.length > 0 ? { openItems } : {}),
      recentMessages,
    })
  }

  const recentHistory = selectRecentMessagesByBudget(
    visible.filter((item) => !recentFocusMessageIds.has(item.id)),
    MAX_RECENT_HISTORY_BYTES,
  )

  return {
    focusList,
    focusContexts,
    recentHistory,
  }
}

import { selectByWindow } from './select-window.js'

import type { IdleIntent, IntentPriority } from '../../types/index.js'

export type IntentSelectParams = {
  minCount: number
  maxCount: number
  maxBytes: number
}

const PRIORITY_RANK: Record<IntentPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

const toMs = (value: string | undefined): number => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const comparePriorityFifo = (a: IdleIntent, b: IdleIntent): number => {
  const priorityRank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (priorityRank !== 0) return priorityRank
  const createdDiff = toMs(a.createdAt) - toMs(b.createdAt)
  if (createdDiff !== 0) return createdDiff
  return a.id.localeCompare(b.id)
}

const compareDoneDesc = (a: IdleIntent, b: IdleIntent): number => {
  const aChanged = toMs(a.archivedAt ?? a.updatedAt)
  const bChanged = toMs(b.archivedAt ?? b.updatedAt)
  if (aChanged !== bChanged) return bChanged - aChanged
  return a.id.localeCompare(b.id)
}

const statusRank = (status: IdleIntent['status']): number => {
  if (status === 'pending') return 0
  if (status === 'blocked') return 1
  return 2
}

export const sortIdleIntents = (intents: IdleIntent[]): IdleIntent[] =>
  [...intents].sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status)
    if (rankDiff !== 0) return rankDiff
    if (a.status === 'done') return compareDoneDesc(a, b)
    return comparePriorityFifo(a, b)
  })

export const selectRecentIntents = (
  intents: IdleIntent[],
  params: IntentSelectParams,
): IdleIntent[] => {
  if (intents.length === 0) return []
  const sorted = sortIdleIntents(intents)
  return selectByWindow(sorted, params, (intent) =>
    Buffer.byteLength(JSON.stringify(intent), 'utf8'),
  )
}

export const selectIdleIntentForTrigger = (
  intents: IdleIntent[],
): IdleIntent | undefined =>
  [...intents]
    .filter(
      (intent) =>
        intent.status === 'pending' && intent.attempts < intent.maxAttempts,
    )
    .sort(comparePriorityFifo)[0]

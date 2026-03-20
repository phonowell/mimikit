import {
  buildBatchResultsDigest,
  buildQueryLookupDigest,
  buildRecentHistoryDigest,
} from './context-digests.js'

import type {
  HistoryMessage,
  ManagerContextPacket,
  QueryLookupMessage,
  Task,
  TaskResult,
} from '../types/index.js'

type DigestSelection = {
  text: string
  payload?: unknown
  stat?: NonNullable<ManagerContextPacket['sectionDigests']>[number]
}

const selectDigest = <
  T extends { payload: Record<string, unknown>; text: string },
>(
  digest:
    | (T & {
        stat: NonNullable<ManagerContextPacket['sectionDigests']>[number]
      })
    | undefined,
  fallback: string,
): DigestSelection => {
  const trimmedFallback = fallback.trim()
  if (!digest) {
    return {
      text: fallback,
      payload: trimmedFallback
        ? (JSON.parse(trimmedFallback) as unknown)
        : undefined,
    }
  }
  if (digest.stat.digestBytes >= digest.stat.sourceBytes) {
    return {
      text: fallback,
      payload: trimmedFallback
        ? (JSON.parse(trimmedFallback) as unknown)
        : undefined,
    }
  }
  return {
    text: digest.text,
    payload: digest.payload,
    stat: digest.stat,
  }
}

export const buildManagerEventDigests = (params: {
  recentHistory: HistoryMessage[]
  recentHistorySource: string
  queryLookup?: QueryLookupMessage
  queryLookupSource: string
  tasks: Task[]
  pendingResults: TaskResult[]
  batchResultsSource: string
}): {
  batchResults: string
  batchResultsPayload?: unknown
  recentHistory: string
  recentHistoryPayload?: unknown
  queryLookup: string
  queryLookupPayload?: unknown
  sectionDigests: NonNullable<ManagerContextPacket['sectionDigests']>
} => {
  const recentHistoryDigest = params.recentHistorySource
    ? buildRecentHistoryDigest({
        history: params.recentHistory,
        sourceText: params.recentHistorySource,
      })
    : undefined
  const queryLookupDigest =
    params.queryLookup && params.queryLookupSource
      ? buildQueryLookupDigest({
          lookup: params.queryLookup,
          sourceText: params.queryLookupSource,
        })
      : undefined
  const batchResultsDigest = params.batchResultsSource
    ? buildBatchResultsDigest({
        tasks: params.tasks,
        results: params.pendingResults,
        sourceText: params.batchResultsSource,
      })
    : undefined

  const selectedBatchResults = selectDigest(
    batchResultsDigest,
    params.batchResultsSource,
  )
  const selectedRecentHistory = selectDigest(
    recentHistoryDigest,
    params.recentHistorySource,
  )
  const selectedQueryLookup = selectDigest(
    queryLookupDigest,
    params.queryLookupSource,
  )

  const sectionDigests: NonNullable<ManagerContextPacket['sectionDigests']> = []
  if (selectedBatchResults.stat) sectionDigests.push(selectedBatchResults.stat)
  if (selectedRecentHistory.stat)
    sectionDigests.push(selectedRecentHistory.stat)
  if (selectedQueryLookup.stat) sectionDigests.push(selectedQueryLookup.stat)

  return {
    batchResults: selectedBatchResults.text,
    batchResultsPayload: selectedBatchResults.payload,
    recentHistory: selectedRecentHistory.text,
    recentHistoryPayload: selectedRecentHistory.payload,
    queryLookup: selectedQueryLookup.text,
    queryLookupPayload: selectedQueryLookup.payload,
    sectionDigests,
  }
}

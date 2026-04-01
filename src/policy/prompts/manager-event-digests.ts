import {
  buildBatchResultsDigest,
  buildRecentHistoryDigest,
} from './context-digests.js'

import type {
  HistoryMessage,
  Task,
  TaskResult,
} from '../../foundation/types/index.js'

type DigestSelection = {
  text: string
  payload?: unknown
}

const selectDigest = <
  T extends {
    payload: Record<string, unknown>
    text: string
    stat: { digestBytes: number; sourceBytes: number }
  },
>(
  digest: T | undefined,
  fallback: string,
  forceSource = false,
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
  if (forceSource) {
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
  }
}

export const buildManagerEventDigests = (params: {
  recentHistory: HistoryMessage[]
  recentHistorySource: string
  tasks: Task[]
  pendingResults: TaskResult[]
  batchResultsSource: string
  forceSourceBatchResults?: boolean
}): {
  batchResults: string
  batchResultsPayload?: unknown
  recentHistory: string
  recentHistoryPayload?: unknown
} => {
  const recentHistoryDigest = params.recentHistorySource
    ? buildRecentHistoryDigest({
        history: params.recentHistory,
        sourceText: params.recentHistorySource,
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
    params.forceSourceBatchResults,
  )
  const selectedRecentHistory = selectDigest(
    recentHistoryDigest,
    params.recentHistorySource,
  )

  return {
    batchResults: selectedBatchResults.text,
    batchResultsPayload: selectedBatchResults.payload,
    recentHistory: selectedRecentHistory.text,
    recentHistoryPayload: selectedRecentHistory.payload,
  }
}

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
  recentHistory: string
  queryLookup: string
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

  const sectionDigests: NonNullable<ManagerContextPacket['sectionDigests']> = []
  if (batchResultsDigest) sectionDigests.push(batchResultsDigest.stat)
  if (recentHistoryDigest) sectionDigests.push(recentHistoryDigest.stat)
  if (queryLookupDigest) sectionDigests.push(queryLookupDigest.stat)

  return {
    batchResults: batchResultsDigest?.text ?? params.batchResultsSource,
    recentHistory: recentHistoryDigest?.text ?? params.recentHistorySource,
    queryLookup: queryLookupDigest?.text ?? params.queryLookupSource,
    sectionDigests,
  }
}

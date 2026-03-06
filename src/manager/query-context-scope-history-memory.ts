import { queryHistory } from '../history/query.js'
import { readHistory } from '../history/store.js'
import { parseIsoToMs } from '../shared/time.js'

import { readMemorySections } from './query-context-memory.js'
import {
  scoreQueryCandidate,
  sortByScoreTimeId,
  truncatePreview,
} from './query-context-score.js'
import { inRange, isWildcardQuery } from './query-context-scope-shared.js'

import type {
  HistoryMessage,
  QueryLookupHistoryItem,
  QueryLookupMemoryItem,
} from '../types/index.js'
import type { QueryContextRequest } from './query-context-schema.js'
import type { RuntimeState } from './runtime-adapter.js'

const mapHistoryEntry = (
  item: HistoryMessage,
  score: number,
  maxItemChars: number,
): QueryLookupHistoryItem => ({
  ref: `history:${item.id}`,
  id: item.id,
  role: item.role,
  time: item.createdAt,
  score,
  focusId: item.focusId,
  snippet: truncatePreview(item.text, maxItemChars),
})

export const queryHistoryScope = async (
  runtime: RuntimeState,
  request: QueryContextRequest,
  scopeLimit: number,
): Promise<QueryLookupHistoryItem[]> => {
  const wildcard = isWildcardQuery(request.query)
  const history = await readHistory(runtime.paths.history)
  if (wildcard) {
    const filtered = history
      .filter(
        (item) =>
          (!request.focusId || item.focusId === request.focusId) &&
          inRange(item.createdAt, request),
      )
      .sort(
        (left, right) =>
          parseIsoToMs(right.createdAt) - parseIsoToMs(left.createdAt),
      )
    const bounds = filtered.map((item) => parseIsoToMs(item.createdAt))
    const oldest = bounds.length > 0 ? Math.min(...bounds) : 0
    const newest = bounds.length > 0 ? Math.max(...bounds) : 0
    return filtered.map((item) =>
      mapHistoryEntry(
        item,
        scoreQueryCandidate({
          query: request.query,
          isWildcard: true,
          haystack: item.text,
          timeMs: parseIsoToMs(item.createdAt),
          oldestMs: oldest,
          newestMs: newest,
        }),
        request.maxItemChars,
      ),
    )
  }

  const lookup = queryHistory(history, {
    query: request.query,
    limit: Math.min((scopeLimit + 1) * 6, 240),
    roles: ['user', 'agent', 'system'],
    ...(request.fromMs !== undefined ? { fromMs: request.fromMs } : {}),
    ...(request.toMs !== undefined ? { toMs: request.toMs } : {}),
  })
  const sourceById = new Map(history.map((item) => [item.id, item]))
  return lookup
    .map((item) => {
      const source = sourceById.get(item.id)
      if (!source) return undefined
      if (request.focusId && source.focusId !== request.focusId) return undefined
      return mapHistoryEntry(source, item.score, request.maxItemChars)
    })
    .filter((item): item is QueryLookupHistoryItem => Boolean(item))
}

export const queryMemoryScope = async (
  runtime: RuntimeState,
  request: QueryContextRequest,
): Promise<QueryLookupMemoryItem[]> => {
  const wildcard = isWildcardQuery(request.query)
  const sections = await readMemorySections(runtime.paths.memoryFile)
  const ranked = sections
    .map((section, index) => {
      const score = scoreQueryCandidate({
        query: request.query,
        isWildcard: wildcard,
        haystack: `${section.title}\n${section.body}`,
        timeMs: index + 1,
        oldestMs: 1,
        newestMs: Math.max(1, sections.length),
      })
      if (!wildcard && score <= 0) return undefined
      return {
        id: section.id,
        timeMs: index + 1,
        score,
        ref: section.id,
        section: section.title,
        snippet: truncatePreview(section.body || section.title, request.maxItemChars),
      } satisfies QueryLookupMemoryItem & { timeMs: number; id: string }
    })
    .filter(
      (
        item,
      ): item is QueryLookupMemoryItem & { timeMs: number; id: string } =>
        Boolean(item),
    )
  return sortByScoreTimeId(ranked)
}

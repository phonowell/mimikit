import { queryHistory } from '../history/query.js'
import { readHistory } from '../history/store.js'
import { parseIsoToMs } from '../shared/time.js'

import { isWildcardQuery } from './query-context-scope-shared.js'
import { scoreQueryCandidate, truncatePreview } from './query-context-score.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { HistoryMessage, QueryLookupHistoryItem } from '../types/index.js'

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
  query: string,
  scopeLimit: number,
  maxItemChars: number,
): Promise<QueryLookupHistoryItem[]> => {
  const wildcard = isWildcardQuery(query)
  const history = await readHistory(runtime.paths.history)
  if (wildcard) {
    const filtered = [...history].sort(
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
          query,
          isWildcard: true,
          haystack: item.text,
          timeMs: parseIsoToMs(item.createdAt),
          oldestMs: oldest,
          newestMs: newest,
        }),
        maxItemChars,
      ),
    )
  }

  const lookup = queryHistory(history, {
    query,
    limit: Math.min((scopeLimit + 1) * 6, 240),
    roles: ['user', 'agent', 'system'],
  })
  const sourceById = new Map(history.map((item) => [item.id, item]))
  return lookup
    .map((item) => {
      const source = sourceById.get(item.id)
      if (!source) return undefined
      return mapHistoryEntry(source, item.score, maxItemChars)
    })
    .filter((item): item is QueryLookupHistoryItem => Boolean(item))
}

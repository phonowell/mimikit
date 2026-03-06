import type { QueryContextRequest } from './query-context-schema.js'
import type { QueryContextScope, QueryLookupMessage } from '../types/index.js'

export type MutableScopeResult = {
  items: unknown[]
  truncated: boolean
  nextOffset?: number
}

export type MutableQueryResults = Partial<
  Record<QueryContextScope, MutableScopeResult>
>

const measureBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), 'utf8')

export const toScopeResult = (
  items: unknown[],
  limit: number,
): MutableScopeResult => {
  const clamped = Math.max(1, limit)
  const sliced = items.slice(0, clamped)
  const truncated = items.length > clamped
  return {
    items: sliced,
    truncated,
    ...(truncated ? { nextOffset: sliced.length } : {}),
  }
}

export const buildQueryLookupMessage = (
  request: QueryContextRequest,
  results: MutableQueryResults,
  maxBytes: number,
): QueryLookupMessage => ({
  request: {
    query: request.query,
  },
  results: results as QueryLookupMessage['results'],
  meta: {
    truncated: false,
    usedBytes: 0,
    maxBytes,
  },
})

const pickMostRemovableScope = (
  results: MutableQueryResults,
): QueryContextScope | undefined => {
  const entries = Object.entries(results) as Array<
    [QueryContextScope, MutableScopeResult]
  >
  const removable = entries.filter(([, value]) => value.items.length > 0)
  if (removable.length === 0) return undefined
  removable.sort((left, right) => {
    if (left[1].items.length !== right[1].items.length)
      return right[1].items.length - left[1].items.length
    return left[0].localeCompare(right[0])
  })
  return removable[0]?.[0]
}

const trimOneScopeItem = (results: MutableQueryResults): boolean => {
  const scope = pickMostRemovableScope(results)
  if (!scope) return false
  const group = results[scope]
  if (!group || group.items.length === 0) return false
  group.items.pop()
  group.truncated = true
  group.nextOffset = group.items.length
  return true
}

export const enforceQueryLookupBudget = (
  message: QueryLookupMessage,
): QueryLookupMessage => {
  const results = message.results as MutableQueryResults
  let usedBytes = measureBytes(message)
  while (usedBytes > message.meta.maxBytes) {
    if (!trimOneScopeItem(results)) break
    message.meta.truncated = true
    usedBytes = measureBytes(message)
  }
  message.meta.usedBytes = usedBytes
  return message
}

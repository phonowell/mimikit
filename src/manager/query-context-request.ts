import type { QueryContextRequest } from './query-context-schema.js'

export const buildQueryContextLookupKey = (
  request?: QueryContextRequest,
): string | undefined => {
  if (!request) return undefined
  return request.query
}

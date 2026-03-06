import { QUERY_CONTEXT_SCOPES } from './query-context-params.js'

import type { QueryContextRequest } from './query-context-schema.js'
import type { QueryContextScope } from '../types/index.js'

export const resolveScopeLimit = (
  request: QueryContextRequest,
  scope: QueryContextScope,
): number => request.scopeLimits[scope] ?? request.limit

export const buildQueryContextLookupKey = (
  request?: QueryContextRequest,
): string | undefined => {
  if (!request) return undefined
  const scopeLimitText = QUERY_CONTEXT_SCOPES.map(
    (scope) => `${scope}:${request.scopeLimits[scope] ?? ''}`,
  ).join(',')
  return [
    request.query,
    request.scopes.join(','),
    String(request.limit),
    scopeLimitText,
    request.from ?? '',
    request.to ?? '',
    request.focusId ?? '',
    (request.taskStatus ?? []).join(','),
    (request.planStatus ?? []).join(','),
    String(request.maxBytes),
    String(request.maxItemChars),
    String(request.archiveMaxFiles),
  ].join('\n')
}

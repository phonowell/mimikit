import {
  buildQueryLookupMessage,
  enforceQueryLookupBudget,
  type MutableQueryResults,
  toScopeResult,
} from './query-context-payload.js'
import {
  buildQueryContextLookupKey,
  resolveScopeLimit,
} from './query-context-request.js'
import {
  pickQueryContextRequest,
  type QueryContextRequest,
  queryContextSchema,
} from './query-context-schema.js'
import { queryTaskArchivesScope } from './query-context-scope-archives.js'
import {
  queryHistoryScope,
  queryMemoryScope,
} from './query-context-scope-history-memory.js'
import {
  queryFocusScope,
  queryPlansScope,
  queryTasksScope,
} from './query-context-scope-runtime.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { QueryContextScope, QueryLookupMessage } from '../types/index.js'

const queryScopeItems = (
  runtime: RuntimeState,
  request: QueryContextRequest,
  scope: QueryContextScope,
): Promise<unknown[]> | unknown[] => {
  const limit = resolveScopeLimit(request, scope)
  if (scope === 'history') return queryHistoryScope(runtime, request, limit)
  if (scope === 'tasks') return queryTasksScope(runtime, request)
  if (scope === 'focus') return queryFocusScope(runtime, request)
  if (scope === 'plans') return queryPlansScope(runtime, request)
  if (scope === 'memory') return queryMemoryScope(runtime, request)
  return queryTaskArchivesScope(runtime, request, limit)
}

export {
  buildQueryContextLookupKey,
  pickQueryContextRequest,
  queryContextSchema,
  resolveScopeLimit,
}
export type { QueryContextRequest }

export const runQueryContextTool = async (params: {
  runtime: RuntimeState
  request: QueryContextRequest
}): Promise<QueryLookupMessage> => {
  const results: MutableQueryResults = {}
  for (const scope of params.request.scopes) {
    const items = await queryScopeItems(params.runtime, params.request, scope)
    results[scope] = toScopeResult(
      items,
      resolveScopeLimit(params.request, scope),
    )
  }
  return enforceQueryLookupBudget(
    buildQueryLookupMessage(params.request, results),
  )
}

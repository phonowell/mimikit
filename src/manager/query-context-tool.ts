import {
  dedupeQueryScopeItems,
  type QueryScopeItems,
} from './query-context-dedupe.js'
import {
  QUERY_CONTEXT_ARCHIVE_MAX_FILES,
  QUERY_CONTEXT_GENERATED_MAX_READ_BYTES,
  QUERY_CONTEXT_GENERATED_SCAN_MAX_FILES,
  QUERY_CONTEXT_GENERATED_SCOPE_LIMIT,
  QUERY_CONTEXT_GENERATED_WALK_MAX_FILES,
  QUERY_CONTEXT_MAX_BYTES,
  QUERY_CONTEXT_MAX_ITEM_CHARS,
  QUERY_CONTEXT_SCOPE_LIMIT,
  QUERY_CONTEXT_SCOPE_ORDER,
} from './query-context-params.js'
import {
  buildQueryLookupMessage,
  enforceQueryLookupBudget,
  type MutableQueryResults,
  toScopeResult,
} from './query-context-payload.js'
import { buildQueryContextLookupKey } from './query-context-request.js'
import {
  pickQueryContextRequest,
  type QueryContextRequest,
  queryContextSchema,
} from './query-context-schema.js'
import { queryTaskArchivesScope } from './query-context-scope-archives.js'
import { queryGeneratedScope } from './query-context-scope-generated.js'
import { queryHistoryScope } from './query-context-scope-history-memory.js'
import {
  queryFocusScope,
  queryPlansScope,
  queryTasksScope,
} from './query-context-scope-runtime.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { QueryLookupMessage } from '../types/index.js'

export {
  buildQueryContextLookupKey,
  pickQueryContextRequest,
  queryContextSchema,
}
export type { QueryContextRequest }

export const runQueryContextTool = async (params: {
  runtime: RuntimeState
  request: QueryContextRequest
}): Promise<QueryLookupMessage> => {
  const raw: QueryScopeItems = {
    history: await queryHistoryScope(
      params.runtime,
      params.request.query,
      QUERY_CONTEXT_SCOPE_LIMIT,
      QUERY_CONTEXT_MAX_ITEM_CHARS,
    ),
    tasks: queryTasksScope(
      params.runtime,
      params.request.query,
      QUERY_CONTEXT_MAX_ITEM_CHARS,
    ),
    focus: queryFocusScope(
      params.runtime,
      params.request.query,
      QUERY_CONTEXT_MAX_ITEM_CHARS,
    ),
    plans: queryPlansScope(
      params.runtime,
      params.request.query,
      QUERY_CONTEXT_MAX_ITEM_CHARS,
    ),
    generated_index: await queryGeneratedScope({
      workDir: params.runtime.config.workDir,
      query: params.request.query,
      maxItemChars: QUERY_CONTEXT_MAX_ITEM_CHARS,
      scanMaxFiles: QUERY_CONTEXT_GENERATED_SCAN_MAX_FILES,
      walkMaxFiles: QUERY_CONTEXT_GENERATED_WALK_MAX_FILES,
      maxReadBytes: QUERY_CONTEXT_GENERATED_MAX_READ_BYTES,
    }),
    task_archives: await queryTaskArchivesScope(
      params.runtime,
      params.request.query,
      QUERY_CONTEXT_SCOPE_LIMIT,
      QUERY_CONTEXT_MAX_ITEM_CHARS,
      QUERY_CONTEXT_ARCHIVE_MAX_FILES,
    ),
  }

  const deduped = dedupeQueryScopeItems(raw)
  const results: MutableQueryResults = {}
  for (const scope of QUERY_CONTEXT_SCOPE_ORDER) {
    results[scope] = toScopeResult(
      deduped[scope],
      scope === 'generated_index'
        ? QUERY_CONTEXT_GENERATED_SCOPE_LIMIT
        : QUERY_CONTEXT_SCOPE_LIMIT,
    )
  }
  return enforceQueryLookupBudget(
    buildQueryLookupMessage(params.request, results, QUERY_CONTEXT_MAX_BYTES),
  )
}

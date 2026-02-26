import { appendLog } from '../log/append.js'
import { queryHistory } from '../history/query.js'
import { readHistory } from '../history/store.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { HistoryLookupMessage } from '../types/index.js'
import type { QueryHistoryRequest } from '../history/query.js'

export const buildHistoryQueryKey = (
  queryRequest?: QueryHistoryRequest,
): string | undefined => {
  if (!queryRequest) return undefined
  return [
    queryRequest.query,
    String(queryRequest.limit),
    queryRequest.roles.join(','),
    queryRequest.beforeId ?? '',
    String(queryRequest.fromMs ?? ''),
    String(queryRequest.toMs ?? ''),
  ].join('\n')
}

export const queryHistoryLookup = async (
  runtime: RuntimeState,
  queryRequest?: QueryHistoryRequest,
): Promise<HistoryLookupMessage[] | undefined> => {
  if (!queryRequest) return undefined
  const history = await readHistory(runtime.paths.history)
  const historyLookup = queryHistory(history, queryRequest)
  await appendLog(runtime.paths.log, {
    event: 'manager_query_history',
    queryChars: queryRequest.query.length,
    limit: queryRequest.limit,
    roleCount: queryRequest.roles.length,
    resultCount: historyLookup.length,
    ...(queryRequest.beforeId ? { beforeId: queryRequest.beforeId } : {}),
    ...(queryRequest.fromMs !== undefined ? { fromMs: queryRequest.fromMs } : {}),
    ...(queryRequest.toMs !== undefined ? { toMs: queryRequest.toMs } : {}),
  })
  return historyLookup
}

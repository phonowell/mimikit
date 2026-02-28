import { queryHistory } from '../history/query.js'
import { readHistory } from '../history/store.js'
import { appendLog } from '../log/append.js'
import { logSafeError } from '../log/safe.js'

import { runReadFileTool } from './read-file-tool.js'

import type { ReadFileRequest } from './read-file-tool.js'
import type { QueryHistoryRequest } from '../history/query.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  HistoryLookupMessage,
  ReadFileLookupMessage,
  UserInput,
} from '../types/index.js'

export {
  buildReadFileLookupKey,
  pickReadFileRequest,
  type ReadFileRequest,
} from './read-file-tool.js'

const INTENT_TRIGGER_EVENT_RE =
  /<M:system_event[^>]*name="intent_trigger"[^>]*>([\s\S]*?)<\/M:system_event>/g

export const collectTriggeredIntentIds = (inputs: UserInput[]): Set<string> => {
  const ids = new Set<string>()
  for (const input of inputs) {
    if (input.role !== 'system') continue
    if (!input.text.includes('name="intent_trigger"')) continue
    INTENT_TRIGGER_EVENT_RE.lastIndex = 0
    let match = INTENT_TRIGGER_EVENT_RE.exec(input.text)
    while (match) {
      const raw = match[1]?.trim()
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { intent_id?: unknown }
          const id =
            typeof payload.intent_id === 'string'
              ? payload.intent_id.trim()
              : ''
          if (id) ids.add(id)
        } catch (error) {
          const rawPreview = raw.length > 120 ? `${raw.slice(0, 120)}...` : raw
          void logSafeError('collectTriggeredIntentIds:parse_payload', error, {
            meta: { rawPreview },
          })
        }
      }
      match = INTENT_TRIGGER_EVENT_RE.exec(input.text)
    }
  }
  return ids
}

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
    ...(queryRequest.fromMs !== undefined
      ? { fromMs: queryRequest.fromMs }
      : {}),
    ...(queryRequest.toMs !== undefined ? { toMs: queryRequest.toMs } : {}),
  })
  return historyLookup
}

export const queryReadFileLookup = async (
  runtime: RuntimeState,
  request?: ReadFileRequest,
): Promise<ReadFileLookupMessage[] | undefined> => {
  if (!request) return undefined
  const result = await runReadFileTool({
    workDir: runtime.config.workDir,
    request,
  })
  await appendLog(runtime.paths.log, {
    event: 'manager_read_file',
    path: result.path,
    status: result.status,
    fromLine: request.fromLine,
    maxLines: request.maxLines,
    maxChars: request.maxChars,
    ...(result.status === 'ok'
      ? {
          lineCount: result.lineCount ?? 0,
          totalLines: result.totalLines ?? 0,
          chars: result.chars ?? 0,
          truncated: result.truncated ?? false,
        }
      : { error: result.error ?? 'unknown_error' }),
  })
  return [result]
}

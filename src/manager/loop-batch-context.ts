import { appendLog } from '../log/append.js'
import { resolveSystemEvent } from '../shared/system-event.js'

import { runQueryContextTool } from './query-context-tool.js'
import { runReadFileTool } from './read-file-tool.js'

import type { QueryContextRequest } from './query-context-tool.js'
import type { ReadFileRequest } from './read-file-tool.js'
import type { RuntimeState } from './runtime-adapter.js'
import type {
  QueryLookupMessage,
  ReadFileLookupMessage,
  UserInput,
} from '../types/index.js'

export {
  buildQueryContextLookupKey,
  pickQueryContextRequest,
  type QueryContextRequest,
} from './query-context-tool.js'
export {
  buildReadFileLookupKey,
  pickReadFileRequest,
  type ReadFileRequest,
} from './read-file-tool.js'

export const collectTriggeredPlanIds = (inputs: UserInput[]): Set<string> => {
  const ids = new Set<string>()
  for (const input of inputs) {
    if (input.role !== 'system') continue
    const event = resolveSystemEvent(input)
    if (event.name !== 'trigger_fire') continue
    const id =
      typeof event.payload?.plan_id === 'string'
        ? event.payload.plan_id.trim()
        : ''
    if (id) ids.add(id)
  }
  return ids
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

export const queryContextLookup = async (
  runtime: RuntimeState,
  request?: QueryContextRequest,
): Promise<QueryLookupMessage | undefined> => {
  if (!request) return undefined
  const result = await runQueryContextTool({ runtime, request })
  const scopeCounts = Object.entries(result.results).reduce<
    Record<string, number>
  >((acc, [scope, value]) => ({ ...acc, [scope]: value.items.length }), {})
  await appendLog(runtime.paths.log, {
    event: 'manager_query_context',
    queryChars: request.query.length,
    resultScopeCount: Object.keys(scopeCounts).length,
    scopeCounts,
    truncated: result.meta.truncated,
    usedBytes: result.meta.usedBytes,
  })
  return result
}

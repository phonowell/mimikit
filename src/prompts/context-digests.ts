import { truncateText } from '../shared/text.js'

import {
  buildCountSummary,
  buildDigest,
  buildQueryScopeItems,
  DIGEST_SUMMARY_MAX_CHARS,
} from './context-digest-shared.js'

import type { SectionDigest } from './context-digest-shared.js'
import type {
  HistoryMessage,
  QueryLookupMessage,
  Task,
  TaskResult,
} from '../types/index.js'

const RECENT_HISTORY_ITEM_LIMIT = 6
const QUERY_SCOPE_ITEM_LIMIT = 2
const BATCH_RESULT_ITEM_LIMIT = 4

export const buildRecentHistoryDigest = (params: {
  history: HistoryMessage[]
  sourceText: string
}): SectionDigest => {
  const sorted = [...params.history].sort((left, right) => {
    if (left.createdAt !== right.createdAt)
      return right.createdAt.localeCompare(left.createdAt)
    return left.id.localeCompare(right.id)
  })
  const selected = sorted.slice(0, RECENT_HISTORY_ITEM_LIMIT)
  return buildDigest({
    section: 'recent_history',
    sourceText: params.sourceText,
    sourceItems: params.history.length,
    sourceRefs: selected.map((item) => item.id),
    truncated: params.history.length > selected.length,
    summary: {
      total_messages: params.history.length,
      sampled_messages: selected.length,
      roles: buildCountSummary(
        params.history.map((item) => ({ key: item.role })),
      ).map((item) => ({ role: item.key, count: item.count })),
      latest_time: selected[0]?.createdAt,
      latest_id: selected[0]?.id,
    },
    items: [],
  })
}

export const buildQueryLookupDigest = (params: {
  lookup?: QueryLookupMessage
  sourceText: string
}): SectionDigest => {
  const { lookup } = params
  if (!lookup) {
    return buildDigest({
      section: 'query_lookup',
      sourceText: params.sourceText,
      sourceItems: 0,
      sourceRefs: [],
      truncated: false,
      summary: {
        query: '',
        total_items: 0,
      },
      items: [],
    })
  }
  const scopeEntries = Object.entries(lookup.results).filter((entry) => {
    const value = entry[1]
    return Array.isArray(value.items) && value.items.length > 0
  }) as Array<
    [
      keyof QueryLookupMessage['results'],
      NonNullable<
        QueryLookupMessage['results'][keyof QueryLookupMessage['results']]
      >,
    ]
  >
  const digestItems = scopeEntries.flatMap(([scope, result]) =>
    buildQueryScopeItems({
      scope,
      items: result.items as Record<string, unknown>[],
      limit: QUERY_SCOPE_ITEM_LIMIT,
    }),
  )
  const sourceRefs = digestItems
    .map((item) => {
      const { ref } = item
      if (typeof ref === 'string' && ref.trim().length > 0) return ref
      const { id } = item
      if (typeof id === 'string' && id.trim().length > 0) return id
      const taskId = item.task_id
      if (typeof taskId === 'string' && taskId.trim().length > 0) return taskId
      const { path } = item
      return typeof path === 'string' ? path : undefined
    })
    .filter((item): item is string => Boolean(item))
  const sourceItems = scopeEntries.reduce(
    (sum, [, result]) => sum + result.items.length,
    0,
  )
  return buildDigest({
    section: 'query_lookup',
    sourceText: params.sourceText,
    sourceItems,
    sourceRefs,
    truncated:
      lookup.meta.truncated ||
      scopeEntries.some(
        ([, result]) =>
          result.truncated || result.items.length > QUERY_SCOPE_ITEM_LIMIT,
      ),
    summary: {
      query: lookup.request.query,
      total_items: sourceItems,
      scopes: scopeEntries.map(([scope, result]) => ({
        scope,
        count: result.items.length,
        truncated: result.truncated,
        next_offset: result.nextOffset,
      })),
      source_meta: lookup.meta,
    },
    items: digestItems,
  })
}

const summarizeStatuses = (
  results: TaskResult[],
): Array<{ status: string; count: number }> =>
  buildCountSummary(results.map((result) => ({ key: result.status }))).map(
    (item) => ({ status: item.key, count: item.count }),
  )

export const buildBatchResultsDigest = (params: {
  tasks: Task[]
  results: TaskResult[]
  sourceText: string
}): SectionDigest => {
  const taskById = new Map(params.tasks.map((task) => [task.id, task]))
  const selected = [...params.results]
    .sort((left, right) => {
      if (left.completedAt !== right.completedAt)
        return right.completedAt.localeCompare(left.completedAt)
      return left.taskId.localeCompare(right.taskId)
    })
    .slice(0, BATCH_RESULT_ITEM_LIMIT)
  return buildDigest({
    section: 'batch_results',
    sourceText: params.sourceText,
    sourceItems: params.results.length,
    sourceRefs: selected.map((item) => item.archivePath ?? item.taskId),
    truncated: params.results.length > selected.length,
    summary: {
      total_results: params.results.length,
      statuses: summarizeStatuses(params.results),
      latest_completed_at: selected[0]?.completedAt,
    },
    items: selected.map((result) => {
      const task = taskById.get(result.taskId)
      return {
        task_id: result.taskId,
        status: result.status,
        task_status: result.taskStatus,
        completed_at: result.completedAt,
        title: task?.title.trim() ?? result.title?.trim() ?? result.taskId,
        ...(result.stopReason ? { stop_reason: result.stopReason } : {}),
        ...(result.archivePath ? { archive_path: result.archivePath } : {}),
        output: truncateText(result.output, DIGEST_SUMMARY_MAX_CHARS, {
          normalizeWhitespace: true,
          suffix: '…',
        }),
        ...(result.handoff?.summary
          ? {
              handoff_summary: truncateText(
                result.handoff.summary,
                DIGEST_SUMMARY_MAX_CHARS,
                {
                  normalizeWhitespace: true,
                  suffix: '…',
                },
              ),
            }
          : {}),
      }
    }),
  })
}

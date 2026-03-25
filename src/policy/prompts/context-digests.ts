import {
  buildCountSummary,
  buildDigest,
  DIGEST_SUMMARY_MAX_CHARS,
} from '../../foundation/prompting/context-digest-shared.js'
import { resolveTaskResultSummary } from '../../work/shared/task-state.js'

import type { SectionDigest } from '../../foundation/prompting/context-digest-shared.js'
import type {
  HistoryMessage,
  Task,
  TaskResult,
} from '../../foundation/types/index.js'

const RECENT_HISTORY_ITEM_LIMIT = 6
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
        summary: resolveTaskResultSummary({
          result,
          ...(task ? { task } : {}),
          maxChars: DIGEST_SUMMARY_MAX_CHARS,
        }),
      }
    }),
  })
}

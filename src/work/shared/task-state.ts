/**
 * @file Shared task state helpers.
 * @description Provides reusable task timestamp, label, and result-summary helpers across modules.
 *
 * Key exports:
 * - resolveTaskChangeAt() - Resolves latest effective task state-change timestamp
 * - resolveTaskLabel() - Resolves the user-facing task label
 * - pickTaskResultSummaryLine() - Extracts a compact user-facing result summary line
 * - formatTaskResultSummary() - Formats a stable task result summary sentence
 */

import { clipCompactText } from '../../foundation/shared/text.js'

import type {
  Task,
  TaskResult,
  TaskResultStatus,
} from '../../foundation/types/index.js'

/** Resolves the latest state-change timestamp for a task. */
export const resolveTaskChangeAt = (task: Task): string =>
  task.completedAt ?? task.pausedAt ?? task.startedAt ?? task.createdAt

/** Resolves the user-facing label for a task. */
export const resolveTaskLabel = (task: Task): string => {
  const title = task.title.trim()
  if (title && title !== task.id) return title
  return task.id
}

/** Extracts the first compact non-code result line for user-facing summaries. */
export const pickTaskResultSummaryLine = (
  output: string,
  maxChars: number,
): string | undefined => {
  const normalizeLine = (line: string): string =>
    clipCompactText(
      line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ''),
      maxChars,
    )

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('```')) continue
    const normalized = normalizeLine(trimmed)
    if (normalized) return normalized
  }

  const fallback = clipCompactText(output, maxChars)
  return fallback || undefined
}

/** Formats a stable user-facing summary sentence for a task result. */
export const formatTaskResultSummary = (
  label: string,
  status: TaskResultStatus,
  detail?: string,
): string => {
  if (status === 'succeeded') {
    return detail
      ? `Task "${label}" completed: ${detail}`
      : `Task "${label}" completed.`
  }
  if (status === 'failed') {
    return detail
      ? `Task "${label}" failed: ${detail}`
      : `Task "${label}" failed.`
  }
  return detail
    ? `Task "${label}" canceled: ${detail}`
    : `Task "${label}" canceled.`
}

/** Resolves the stable result summary exposed back to the manager/focus/history layers. */
export const resolveTaskResultSummary = (params: {
  result: Pick<TaskResult, 'taskId' | 'title' | 'status' | 'handoff'>
  task?: Task
  maxChars?: number
}): string => {
  const maxChars = params.maxChars ?? 280
  const handoffSummary = clipCompactText(
    params.result.handoff?.summary?.trim() ?? '',
    maxChars,
  )
  if (handoffSummary) return handoffSummary
  const label = params.task
    ? resolveTaskLabel(params.task)
    : (params.result.title?.trim() ?? params.result.taskId)
  return clipCompactText(
    formatTaskResultSummary(label, params.result.status),
    maxChars,
  )
}

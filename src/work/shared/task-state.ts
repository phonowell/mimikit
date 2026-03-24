/**
 * @file Shared task state helpers.
 * @description Provides reusable task timestamp, label, result-summary, and recoverable-state helpers across modules.
 *
 * Key exports:
 * - resolveTaskChangeAt() - Resolves latest effective task state-change timestamp
 * - resolveTaskLabel() - Resolves the user-facing task label
 * - pickTaskResultSummaryLine() - Extracts a compact user-facing result summary line
 * - formatTaskResultSummary() - Formats a stable task result summary sentence
 * - isBudgetRecoverableTask() - Detects paused partial tasks that can resume
 */

import { clipCompactText } from '../../foundation/shared/text.js'

import type { Task, TaskResultStatus } from '../../foundation/types/index.js'

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
  if (status === 'partial') {
    return detail
      ? `Task "${label}" paused with partial result: ${detail}`
      : `Task "${label}" paused with partial result.`
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

/** Detects whether a paused task has a resumable budget partial result. */
export const isBudgetRecoverableTask = (task: Task): boolean =>
  task.status === 'paused' &&
  task.result?.status === 'partial' &&
  task.result.stopReason === 'budget_exhausted'

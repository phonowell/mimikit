import { clipCompactText } from '../../foundation/shared/text.js'
import {
  formatTaskResultSummary,
  pickTaskResultSummaryLine,
  resolveTaskLabel,
} from '../shared/task-state.js'

import { ensureFocus, normalizeFocusSummary, touchFocus } from './state.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

const MAX_RESULT_SUMMARY_CHARS = 280

const clipText = (value: string, maxChars: number): string =>
  clipCompactText(value, maxChars)

const formatSummary = (task: Task, result: TaskResult): string => {
  const label = resolveTaskLabel(task)
  const detail = pickTaskResultSummaryLine(
    result.output,
    MAX_RESULT_SUMMARY_CHARS,
  )
  return formatTaskResultSummary(label, result.status, detail)
}

const resolveHandoffSummary = (result: TaskResult): string | undefined => {
  const summary = result.handoff?.summary?.trim()
  if (!summary) return undefined
  return clipText(summary, MAX_RESULT_SUMMARY_CHARS)
}

export const syncFocusFromTaskResult = (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
): void => {
  const focusId = task.focusId.trim()
  if (focusId.length === 0) return
  const focus = ensureFocus(runtime, focusId)
  const summary = resolveHandoffSummary(result) ?? formatSummary(task, result)
  const normalizedSummary = normalizeFocusSummary(summary)
  if (normalizedSummary) focus.summary = normalizedSummary
  else delete focus.summary
  touchFocus(runtime, focusId)
}

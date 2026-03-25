import { clipCompactText } from '../../foundation/shared/text.js'
import { resolveTaskResultSummary } from '../shared/task-state.js'

import { ensureFocus, normalizeFocusSummary, touchFocus } from './state.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'
import type { RuntimeFocusCollection } from '../../kernel/orchestrator/runtime-interfaces.js'

const MAX_RESULT_SUMMARY_CHARS = 280

const clipText = (value: string, maxChars: number): string =>
  clipCompactText(value, maxChars)

const formatSummary = (task: Task, result: TaskResult): string =>
  resolveTaskResultSummary({
    task,
    result,
    maxChars: MAX_RESULT_SUMMARY_CHARS,
  })

const resolveHandoffSummary = (result: TaskResult): string | undefined => {
  const summary = result.handoff?.summary?.trim()
  if (!summary) return undefined
  return clipText(summary, MAX_RESULT_SUMMARY_CHARS)
}

export const syncFocusFromTaskResult = (
  runtime: { focuses: RuntimeFocusCollection },
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

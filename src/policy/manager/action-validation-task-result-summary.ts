import { summarizeSchema } from './action-apply-schema.js'
import { formatSetTaskResultSummaryTaskNotInBatchHint } from './action-feedback-hints.js'
import { parseActionAttrs } from './action-parse.js'
import {
  rejected,
  validateItemWithSchema,
  type ValidationIssue,
} from './action-validation-helpers.js'

import type { Parsed } from '../actions/model/spec.js'

export const validateTaskResultSummaryAction = (params: {
  item: Parsed
  resultTaskIds?: Set<string>
}): ValidationIssue[] => {
  const parsed = parseActionAttrs(params.item, summarizeSchema)
  if (!parsed) return validateItemWithSchema(params.item, summarizeSchema)
  const { resultTaskIds } = params
  if (!resultTaskIds) return []
  if (resultTaskIds.has(parsed.task_id)) return []
  const available = [...resultTaskIds].slice(0, 3)
  const availableHint =
    available.length > 0
      ? `当前批次可用 task_id: ${available.join(', ')}。`
      : '当前批次无可摘要的 task_result。'
  return rejected(formatSetTaskResultSummaryTaskNotInBatchHint(availableHint))
}

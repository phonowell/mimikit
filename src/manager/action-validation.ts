import {
  createPlanSchema,
  readFileSchema,
  updatePlanSchema,
} from './action-apply-schema.js'
import {
  formatPlanNotFoundHint,
  formatUpdatePlanDoneForbiddenHint,
} from './action-feedback-hints.js'
import { parseActionAttrs } from './action-parse.js'
import {
  invalidArgsIssue,
  rejected,
  validateItemWithSchema,
  type ValidationIssue,
} from './action-validation-helpers.js'
import {
  validateCreatePlanSchedule,
  validateUpdatePlanSchedule,
} from './action-validation-plan.js'
import {
  type FeedbackContext,
  validateAskUserChoice,
  validateMutateTask,
  validateRememberMemory,
  validateRunTask,
  validateSummarizeTaskResult,
} from './action-validation-risk.js'
import { queryContextSchema } from './query-context-tool.js'

import type { Parsed } from '../actions/model/spec.js'
import type { ZodSchema } from 'zod'

export type { FeedbackContext } from './action-validation-risk.js'
export type { ValidationIssue } from './action-validation-helpers.js'

export const validateWithSchema = (
  item: Parsed,
  schema: ZodSchema,
): ValidationIssue[] => validateItemWithSchema(item, schema)

export { validateRunTask }

export const validateCreatePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, createPlanSchema)
  if (!parsed) return validateWithSchema(item, createPlanSchema)
  return validateCreatePlanSchedule(item, context)
}

export { validateMutateTask }

export const validateQueryContext = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, queryContextSchema)

export const validateReadFile = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, readFileSchema)

export {
  validateRememberMemory,
  validateSummarizeTaskResult,
  validateAskUserChoice,
}

export const validatePlanById = (
  action: 'update_plan' | 'delete_plan',
  item: Parsed,
  schema: ZodSchema<{ id: string }>,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = schema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const status = context.planStatusById?.get(parsed.data.id)
  if (!status) return rejected(formatPlanNotFoundHint(action))
  if (action === 'update_plan' && status === 'done') {
    const keys = new Set(Object.keys(item.attrs))
    const isLastTaskPatch =
      keys.size > 0 &&
      [...keys].every((key) => key === 'id' || key === 'last_task_id') &&
      typeof item.attrs.last_task_id === 'string' &&
      item.attrs.last_task_id.trim().length > 0
    if (isLastTaskPatch) return []
    return rejected(formatUpdatePlanDoneForbiddenHint())
  }
  return []
}

export const validateUpdatePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, updatePlanSchema)
  if (!parsed) return validateWithSchema(item, updatePlanSchema)
  return validateUpdatePlanSchedule(item, context)
}

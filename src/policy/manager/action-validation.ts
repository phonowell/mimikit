import { createPlanSchema, updatePlanSchema } from './action-apply-schema.js'
import {
  formatPlanNotFoundHint,
  formatUpdatePlanDoneForbiddenHint,
} from './action-feedback-hints.js'
import { parseActionAttrs } from './action-parse.js'
import {
  invalidArgsIssue,
  rejected,
  validateItemWithSchema,
  validateScheduledAtNotPast,
  type ValidationIssue,
} from './action-validation-helpers.js'
import {
  validateAskUserChoice,
  validateMutateTask,
  validateRememberMemory,
  validateRestartRuntime,
  validateRunTask,
  validateSummarizeTaskResult,
} from './action-validation-risk.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { Parsed } from '../actions/model/spec.js'
import type { ZodSchema } from 'zod'

export type { FeedbackContext } from './action-validation-context.js'
export type { ValidationIssue } from './action-validation-helpers.js'

const resolveScheduleNowOption = (
  context: Pick<FeedbackContext, 'scheduleNowIso'>,
): { scheduleNowIso?: string } =>
  context.scheduleNowIso !== undefined
    ? { scheduleNowIso: context.scheduleNowIso }
    : {}

export const validateWithSchema = (
  item: Parsed,
  schema: ZodSchema,
): ValidationIssue[] => validateItemWithSchema(item, schema)

export { validateRunTask }
export { validateRestartRuntime }

export const validateCreatePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, createPlanSchema)
  if (!parsed) return validateWithSchema(item, createPlanSchema)
  if (parsed.schedule_type !== 'scheduled_at' || !parsed.scheduled_at?.trim())
    return []
  return validateScheduledAtNotPast({
    action: 'create_plan',
    scheduledAt: parsed.scheduled_at,
    ...resolveScheduleNowOption(context),
  })
}

export { validateMutateTask }

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
  if (action === 'update_plan' && status === 'done')
    return rejected(formatUpdatePlanDoneForbiddenHint())
  return []
}

export const validateUpdatePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, updatePlanSchema)
  if (!parsed) return validateWithSchema(item, updatePlanSchema)
  const scheduledAt = parsed.scheduled_at?.trim()
  if (parsed.schedule_type !== 'scheduled_at' || !scheduledAt) return []
  return validateScheduledAtNotPast({
    action: 'update_plan',
    scheduledAt,
    ...resolveScheduleNowOption(context),
  })
}
